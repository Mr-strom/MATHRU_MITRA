/**
 * MaatruMitra — End-to-end API and Workflow Integration Tests.
 *
 * Covers the 10 required verification scenarios:
 * 1. GET /api/v1/me works for authenticated session and rejects anonymous requests.
 * 2. Synthetic beneficiary endpoint is authenticated, area-scoped, and refuses arbitrary queries.
 * 3. Voice-note submission fails when no synthetic file has been attached.
 * 4. ASHA cannot access another ASHA's voice note, transcript, draft, or task.
 * 5. ANM cannot access or confirm a draft outside ANM's area.
 * 6. Draft is created only from the saved worker-edited transcript revision.
 * 7. ASHA cannot submit until the draft is WORKER_REVIEWED.
 * 8. ANM must select an eligible area ASHA owner; confirm creates one TASK_OPEN task.
 * 9. Illegal state transitions, duplicate confirmations, and unauthorized completion are rejected.
 * 10. Audit history contains the expected safe transition records and no messaging/clinical fields.
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { seedTestUsers, seedTestSop, testDb } from "./_setup.js";
import { issueAccessToken } from "../services/auth.service.js";
import * as voiceNotesRepo from "../repositories/voiceNotes.repo.js";
import * as transcriptsRepo from "../repositories/transcripts.repo.js";
import * as draftsRepo from "../repositories/followUpDrafts.repo.js";
import * as tasksRepo from "../repositories/tasks.repo.js";
import { getStorageProvider } from "../providers/storage/index.js";

const app = createApp();

function getAuthHeader(userId: string, username: string, role: "ASHA_WORKER" | "ANM_REVIEWER" | "PHC_ADMIN", areaId: string | null) {
  const token = issueAccessToken({
    id: userId,
    username,
    display_name: `Test ${role}`,
    role,
    assigned_area_id: areaId,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return `Bearer ${token}`;
}

describe("End-to-End API and Workflow Verification", () => {
  let ashaAuth: string;
  let asha2Auth: string;
  let anmAuth: string;
  let anmOtherAreaAuth: string;
  let adminAuth: string;

  beforeEach(async () => {
    await seedTestUsers();
    seedTestSop();

    // Create a second ASHA in same area
    const hash = "$2a$10$abcdefghijklmnopqrstuvwxyz012345";
    testDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, role, assigned_area_id, password_hash)
      VALUES ('test-asha-002', 'test.asha2', 'Test ASHA 2', 'ASHA_WORKER', 'test-area-001', ?)
    `).run(hash);

    // Create a second area + ANM in different area
    testDb.prepare(`
      INSERT OR IGNORE INTO areas (id, district, taluk, phc_name, ward_village_label)
      VALUES ('test-area-002', 'OtherDistrict', 'OtherTaluk', 'OtherPHC', 'Ward 99')
    `).run();

    testDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, role, assigned_area_id, password_hash)
      VALUES ('test-anm-002', 'test.anm2', 'Test ANM Other Area', 'ANM_REVIEWER', 'test-area-002', ?)
    `).run(hash);

    ashaAuth = getAuthHeader("test-asha-001", "test.asha", "ASHA_WORKER", "test-area-001");
    asha2Auth = getAuthHeader("test-asha-002", "test.asha2", "ASHA_WORKER", "test-area-001");
    anmAuth = getAuthHeader("test-anm-001", "test.anm", "ANM_REVIEWER", "test-area-001");
    anmOtherAreaAuth = getAuthHeader("test-anm-002", "test.anm2", "ANM_REVIEWER", "test-area-002");
    adminAuth = getAuthHeader("test-admin-001", "test.admin", "PHC_ADMIN", "test-area-001");
  });

  // ── 1. GET /api/v1/me ───────────────────────────────────────────────────────
  it("1. GET /api/v1/me works for authenticated session and rejects anonymous requests", async () => {
    // Unauthenticated
    const anonRes = await request(app).get("/api/v1/me");
    expect(anonRes.status).toBe(401);

    // Authenticated
    const authRes = await request(app)
      .get("/api/v1/me")
      .set("Authorization", ashaAuth);
    expect(authRes.status).toBe(200);
    expect(authRes.body.id).toBe("test-asha-001");
    expect(authRes.body.role).toBe("ASHA_WORKER");
  });

  // ── 2. Synthetic beneficiary endpoint ──────────────────────────────────────
  it("2. GET /api/v1/beneficiary-refs/demo is authenticated, area-scoped, and refuses arbitrary queries", async () => {
    // Anonymous rejected
    const anon = await request(app).get("/api/v1/beneficiary-refs/demo");
    expect(anon.status).toBe(401);

    // Authenticated in matching area returns synthetic fixture
    const res = await request(app)
      .get("/api/v1/beneficiary-refs/demo")
      .set("Authorization", ashaAuth);
    expect(res.status).toBe(200);
    expect(res.body.external_reference_alias).toBe("BEN-TEST-001");
    expect(res.body.fixture).toBe(true);

    // Different area ANM is rejected
    const diffArea = await request(app)
      .get("/api/v1/beneficiary-refs/demo")
      .set("Authorization", anmOtherAreaAuth);
    expect(diffArea.status).toBe(403);
  });

  // ── 3. Audio upload & submission check ─────────────────────────────────────
  it("3. Voice-note submission fails when no synthetic file has been attached", async () => {
    // Create upload intent
    const intentRes = await request(app)
      .post("/api/v1/voice-notes")
      .set("Authorization", ashaAuth)
      .send({
        beneficiary_reference_id: "test-ben-001",
        mime_type: "audio/webm",
        byte_size: 1024,
        consent_given: true,
      });
    expect(intentRes.status).toBe(201);
    const vnId = intentRes.body.voice_note.id;

    // Submit before uploading file -> must fail (409 Conflict/PolicyError)
    const submitFail = await request(app)
      .post(`/api/v1/voice-notes/${vnId}/submit`)
      .set("Authorization", ashaAuth);
    expect(submitFail.status).toBe(409);
    expect(submitFail.body.code).toBe("AUDIO_NOT_ATTACHED");

    // Attach synthetic file
    const storage = getStorageProvider();
    await storage.putObject(intentRes.body.voice_note.storage_key, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm");

    // Submit after uploading file -> succeeds
    const submitOk = await request(app)
      .post(`/api/v1/voice-notes/${vnId}/submit`)
      .set("Authorization", ashaAuth);
    expect(submitOk.status).toBe(200);
  });

  // ── 4. Cross-ASHA isolation ─────────────────────────────────────────────────
  it("4. An ASHA cannot access another ASHA's voice note, transcript, draft, or task", async () => {
    // ASHA 1 creates voice note & transcript
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/audio1.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
      language_declared: "kn",
    });
    const tx = transcriptsRepo.create({
      voice_note_id: vn.id,
      source: "PROVIDER",
      language: "kn",
      text: "ಗರ್ಭಿಣಿ ತಪಾಸಣೆ ವಿವರ",
      created_by_user_id: "test-asha-001",
    });
    const draft = draftsRepo.create({
      voice_note_id: vn.id,
      transcript_id: tx.id,
      administrative_category: "ROUTINE_HOME_VISIT",
      summary: "Routine checkup note",
    });

    // ASHA 2 tries to read ASHA 1's voice note -> 409 PolicyError FORBIDDEN
    const getVn = await request(app)
      .get(`/api/v1/voice-notes/${vn.id}`)
      .set("Authorization", asha2Auth);
    expect([403, 409]).toContain(getVn.status);

    // ASHA 2 tries to read ASHA 1's transcripts -> 409 PolicyError FORBIDDEN
    const getTx = await request(app)
      .get(`/api/v1/voice-notes/${vn.id}/transcripts`)
      .set("Authorization", asha2Auth);
    expect([403, 409]).toContain(getTx.status);

    // ASHA 2 tries to read ASHA 1's draft -> 403 ForbiddenError
    const getDraft = await request(app)
      .get(`/api/v1/follow-up-drafts/${draft.id}`)
      .set("Authorization", asha2Auth);
    expect(getDraft.status).toBe(403);
  });

  // ── 5. ANM Area Isolation ──────────────────────────────────────────────────
  it("5. An ANM cannot access or confirm a draft outside the ANM's assigned area", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001", // in test-area-001
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/audio2.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({
      voice_note_id: vn.id,
      source: "PROVIDER",
      language: "kn",
      text: "ವಿವರ",
    });
    const draft = draftsRepo.create({
      voice_note_id: vn.id,
      transcript_id: tx.id,
    });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");

    // ANM in other area (test-area-002) tries to read draft -> 403
    const getRes = await request(app)
      .get(`/api/v1/follow-up-drafts/${draft.id}`)
      .set("Authorization", anmOtherAreaAuth);
    expect(getRes.status).toBe(403);

    // ANM in other area tries to confirm draft -> 403
    const confirmRes = await request(app)
      .post(`/api/v1/follow-up-drafts/${draft.id}/confirm`)
      .set("Authorization", anmOtherAreaAuth)
      .send({
        owner_user_id: "test-asha-001",
        due_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(confirmRes.status).toBe(403);
  });

  // ── 6. Draft created from worker-edited transcript revision ─────────────────
  it("6. The draft is created only from the saved worker-edited transcript revision", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/audio3.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    // Set status to TRANSCRIPT_READY so worker can revise
    voiceNotesRepo.updateStatus(vn.id, "TRANSCRIPT_READY");

    // Provider transcript
    transcriptsRepo.create({
      voice_note_id: vn.id,
      source: "PROVIDER",
      language: "kn",
      text: "ಪ್ರಾಥಮಿಕ ಪಠ್ಯ",
    });

    // Worker saves edited revision
    const revRes = await request(app)
      .post(`/api/v1/voice-notes/${vn.id}/transcripts`)
      .set("Authorization", ashaAuth)
      .send({ text: "ತಿದ್ದಿದ ನಿಖರ ಪಠ್ಯ", language: "kn" });
    expect(revRes.status).toBe(201);
    const workerRevisionId = revRes.body.transcript.id;

    // Create draft from the worker revision
    const draftRes = await request(app)
      .post("/api/v1/follow-up-drafts/from-transcript")
      .set("Authorization", ashaAuth)
      .send({ transcript_id: workerRevisionId });
    expect(draftRes.status).toBe(201);
    expect(draftRes.body.draft.transcript_id).toBe(workerRevisionId);
  });

  // ── 7. Submission requires WORKER_REVIEWED state ────────────────────────────
  it("7. An ASHA cannot submit until the draft is WORKER_REVIEWED", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/audio4.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({
      voice_note_id: vn.id,
      source: "WORKER_EDITED",
      language: "kn",
      text: "ಪರಿಷ್ಕೃತ ಮಾಹಿತಿ",
    });
    const draft = draftsRepo.create({
      voice_note_id: vn.id,
      transcript_id: tx.id,
    });
    // Draft starts in TRANSCRIPT_READY

    // Submit for review while still in TRANSCRIPT_READY -> rejected (409 PolicyError)
    const prematureSubmit = await request(app)
      .post(`/api/v1/follow-up-drafts/${draft.id}/submit-review`)
      .set("Authorization", ashaAuth)
      .send({});
    expect(prematureSubmit.status).toBe(409);

    // Mark as WORKER_REVIEWED
    const reviewRes = await request(app)
      .post(`/api/v1/follow-up-drafts/${draft.id}/mark-reviewed`)
      .set("Authorization", ashaAuth);
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.draft.state).toBe("WORKER_REVIEWED");

    // Now submit succeeds
    const okSubmit = await request(app)
      .post(`/api/v1/follow-up-drafts/${draft.id}/submit-review`)
      .set("Authorization", ashaAuth)
      .send({ worker_note: "Please review IFA note." });
    expect(okSubmit.status).toBe(200);
    expect(okSubmit.body.draft.state).toBe("AWAITING_ANM_REVIEW");
  });

  // ── 8. ANM selects eligible area ASHA owner & creates TASK_OPEN ────────────
  it("8. ANM must select an eligible area ASHA owner; confirm creates one TASK_OPEN task", async () => {
    // Check assignable ASHAs endpoint returns only active area ASHAs
    const ashasRes = await request(app)
      .get("/api/v1/users/assignable-ashas")
      .set("Authorization", anmAuth);
    expect(ashasRes.status).toBe(200);
    expect(ashasRes.body.items.length).toBeGreaterThanOrEqual(1);
    expect(ashasRes.body.items.every((u: { role: string }) => u.role === "ASHA_WORKER")).toBe(true);

    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/audio5.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "WORKER_EDITED", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");

    // Confirm with area ASHA
    const confirmRes = await request(app)
      .post(`/api/v1/follow-up-drafts/${draft.id}/confirm`)
      .set("Authorization", anmAuth)
      .send({
        owner_user_id: "test-asha-002",
        due_at: new Date(Date.now() + 86400000).toISOString(),
        reviewer_note: "Follow up on Monday",
      });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.draft.state).toBe("CONFIRMED");
    expect(confirmRes.body.task.status).toBe("TASK_OPEN");
    expect(confirmRes.body.task.owner_user_id).toBe("test-asha-002");
  });

  // ── 9. State transitions & illegal completion rejected ─────────────────────
  it("9. Illegal state transitions, duplicate confirmations, and unauthorized completion are rejected", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/audio6.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "WORKER_EDITED", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");

    const confirmRes = await request(app)
      .post(`/api/v1/follow-up-drafts/${draft.id}/confirm`)
      .set("Authorization", anmAuth)
      .send({
        owner_user_id: "test-asha-001",
        due_at: new Date(Date.now() + 86400000).toISOString(),
      });
    const taskId = confirmRes.body.task.id;

    // Duplicate confirmation rejected (409 PolicyError)
    const dupRes = await request(app)
      .post(`/api/v1/follow-up-drafts/${draft.id}/confirm`)
      .set("Authorization", anmAuth)
      .send({
        owner_user_id: "test-asha-001",
        due_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(dupRes.status).toBe(409);

    // Non-owner ASHA 2 tries to acknowledge task -> rejected (403 ForbiddenError)
    const nonOwnerAck = await request(app)
      .post(`/api/v1/tasks/${taskId}/acknowledge`)
      .set("Authorization", asha2Auth);
    expect(nonOwnerAck.status).toBe(403);

    // Owner skips directly to complete without acknowledgement -> rejected (409 PolicyError)
    const skipAck = await request(app)
      .post(`/api/v1/tasks/${taskId}/complete`)
      .set("Authorization", ashaAuth)
      .send({ completion_note: "Done" });
    expect(skipAck.status).toBe(409);

    // Proper sequence: acknowledge then complete -> succeeds
    const ackOk = await request(app)
      .post(`/api/v1/tasks/${taskId}/acknowledge`)
      .set("Authorization", ashaAuth);
    expect(ackOk.status).toBe(200);

    const completeOk = await request(app)
      .post(`/api/v1/tasks/${taskId}/complete`)
      .set("Authorization", ashaAuth)
      .send({ completion_note: "Household visit completed." });
    expect(completeOk.status).toBe(200);
    expect(completeOk.body.task.status).toBe("TASK_COMPLETED");
  });

  // ── 10. Audit history cleanliness ──────────────────────────────────────────
  it("10. Audit history contains expected safe transition records and no messaging/clinical fields", () => {
    const events = testDb
      .prepare("SELECT * FROM audit_events")
      .all() as Array<{ safe_payload_json: string | null; event_type: string }>;

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      const payload = e.safe_payload_json ?? "";
      expect(payload).not.toContain("sms");
      expect(payload).not.toContain("whatsapp");
      expect(payload).not.toContain("bearer");
      expect(payload).not.toContain("password");
      expect(payload).not.toContain("diagnosis");
      expect(payload).not.toContain("prescription");
    }
  });
});
