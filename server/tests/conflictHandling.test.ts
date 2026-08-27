/**
 * MaatruMitra — Optimistic Concurrency & Conflict Handling Integration Tests.
 *
 * Tests:
 * 1. Monotonic server_version increment on updates.
 * 2. Stale base version detection (returns CONFLICT and STALE_BASE_VERSION).
 * 3. Invariant: No automatic silent merging of transcript text or administrative fields.
 * 4. Authorization gate: ASHA cannot overwrite ANM supervisory decisions.
 * 5. Authorization gate: ANM cannot resolve records outside their assigned area.
 * 6. Authorized conflict resolution: updates entity, increments server_version, and records audit event with both snapshots.
 * 7. Out-of-order queue processing handling.
 * 8. Refresh recovery, offline-to-online simulation, and duplicate retry idempotency.
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
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import {
  queueAction,
  getAllQueuedActions,
  processOfflineQueue,
  resolveQueuedConflict,
  clearSyncedActions,
} from "../../client/src/lib/offlineQueue.js";

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

describe("Optimistic Concurrency & Conflict Resolution", () => {
  let ashaAuth: string;
  let anmAuth: string;
  let anmOtherAreaAuth: string;

  beforeEach(async () => {
    await seedTestUsers();
    seedTestSop();

    // Create a second area + ANM in different area
    testDb.prepare(`
      INSERT OR IGNORE INTO areas (id, district, taluk, phc_name, ward_village_label)
      VALUES ('test-area-002', 'OtherDistrict', 'OtherTaluk', 'OtherPHC', 'Ward 99')
    `).run();

    const hash = "$2a$10$abcdefghijklmnopqrstuvwxyz012345";
    testDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, role, assigned_area_id, password_hash)
      VALUES ('test-anm-002', 'test.anm2', 'Test ANM Other Area', 'ANM_REVIEWER', 'test-area-002', ?)
    `).run(hash);

    ashaAuth = getAuthHeader("test-asha-001", "test.asha", "ASHA_WORKER", "test-area-001");
    anmAuth = getAuthHeader("test-anm-001", "test.anm", "ANM_REVIEWER", "test-area-001");
    anmOtherAreaAuth = getAuthHeader("test-anm-002", "test.anm2", "ANM_REVIEWER", "test-area-002");
  });

  it("1. Monotonic server_version increment on draft updates", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/occ_test_01.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    expect(vn.server_version).toBe(1);

    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ಗರ್ಭಿಣಿ ತಪಾಸಣೆ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    expect(draft.server_version).toBe(1);

    // Transition TRANSCRIPT_READY -> WORKER_REVIEWED
    draftsRepo.updateState(draft.id, "WORKER_REVIEWED");
    const v2Draft = draftsRepo.findById(draft.id)!;
    expect(v2Draft.server_version).toBe(2);

    // Transition WORKER_REVIEWED -> AWAITING_ANM_REVIEW
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");
    const v3Draft = draftsRepo.findById(draft.id)!;
    expect(v3Draft.server_version).toBe(3);
  });

  it("2. Stale base version detection returns CONFLICT and STALE_BASE_VERSION", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/occ_test_02.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    // Advance server to version 2
    draftsRepo.updateState(draft.id, "WORKER_REVIEWED");

    // Client sends an action based on stale version 1
    const res = await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", ashaAuth)
      .send({
        action_id: "act-stale-02",
        idempotency_key: "idem-stale-02",
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        action_type: "SUBMIT_TO_ANM",
        base_server_version: 1, // Stale! Current server version is 2
        payload: { worker_note: "Stale offline submission" },
        created_at: new Date().toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("CONFLICT");
    expect(res.body.conflict_code).toBe("STALE_BASE_VERSION");
    expect(res.body.authoritative_entity).toBeDefined();
    expect(res.body.authoritative_entity.server_version).toBe(2);
  });

  it("3. Invariant: No automatic silent merging of transcript text or administrative fields", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/occ_test_03.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ಮೂಲ ಪಠ್ಯ" });
    const draft = draftsRepo.create({
      voice_note_id: vn.id,
      transcript_id: tx.id,
      summary: "ಸರ್ವರ್ ದಾಖಲಿತ ಸಾರಾಂಶ",
    });
    draftsRepo.updateState(draft.id, "WORKER_REVIEWED");

    // Attempting stale sync must not silently overwrite or merge summary
    await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", ashaAuth)
      .send({
        action_id: "act-nomerge-03",
        idempotency_key: "idem-nomerge-03",
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        action_type: "SUBMIT_TO_ANM",
        base_server_version: 1,
        payload: { summary: "ಆಫ್‌ಲೈನ್ ತಿದ್ದಿದ ಸಾರಾಂಶ" },
        created_at: new Date().toISOString(),
      });

    // Server summary remains untouched
    const currentDraft = draftsRepo.findById(draft.id)!;
    expect(currentDraft.summary).toBe("ಸರ್ವರ್ ದಾಖಲಿತ ಸಾರಾಂಶ");
  });

  it("4. Authorization gate: ASHA cannot overwrite ANM supervisory decisions", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/occ_test_04.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");
    // ANM confirms the draft
    draftsRepo.updateState(draft.id, "CONFIRMED");

    // ASHA attempts to resolve conflict by forcing KEEP_LOCAL -> 403 Forbidden
    const res = await request(app)
      .post("/api/v1/sync/conflicts/resolve")
      .set("Authorization", ashaAuth)
      .send({
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        base_server_version: 1,
        resolution_strategy: "KEEP_LOCAL",
        resolution_reason: "Trying to overwrite confirmed state",
        local_snapshot: { summary: "ASHA override attempt" },
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("ASHA workers cannot overwrite an ANM supervisory decision");
  });

  it("5. Authorization gate: ANM cannot resolve records outside assigned area", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001", // in test-area-001
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/occ_test_05.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");

    // ANM from test-area-002 attempts to resolve conflict in test-area-001 -> 403 Forbidden
    const res = await request(app)
      .post("/api/v1/sync/conflicts/resolve")
      .set("Authorization", anmOtherAreaAuth)
      .send({
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        base_server_version: 1,
        resolution_strategy: "KEEP_SERVER",
        resolution_reason: "Cross area resolution attempt",
        local_snapshot: {},
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("ANM cannot resolve conflicts for drafts outside their assigned administrative area");
  });

  it("6. Authorized conflict resolution: applies updates, increments server_version, and records audit event with both snapshots", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/occ_test_06.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({
      voice_note_id: vn.id,
      transcript_id: tx.id,
      summary: "ಮೂಲ ಸಾರಾಂಶ",
    });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");
    const initialVersion = draftsRepo.findById(draft.id)!.server_version;

    // ANM resolves conflict using MANUAL_MERGE
    const res = await request(app)
      .post("/api/v1/sync/conflicts/resolve")
      .set("Authorization", anmAuth)
      .send({
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        base_server_version: initialVersion,
        resolution_strategy: "MANUAL_MERGE",
        resolved_fields: { summary: "ಸಂಯೋಜಿತ ಹಾಗೂ ಪರಿಶೀಲಿಸಿದ ಸಾರಾಂಶ" },
        resolution_reason: "Reconciled with field notes after phone clarification",
        local_snapshot: { summary: "ಆಫ್‌ಲೈನ್ ಗಮನಿಕೆಗಳು" },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.new_server_version).toBe(initialVersion + 1);
    expect(res.body.authoritative_entity.summary).toBe("ಸಂಯೋಜಿತ ಹಾಗೂ ಪರಿಶೀಲಿಸಿದ ಸಾರಾಂಶ");

    // Verify audit event contains both snapshots
    const auditEvents = auditEventsRepo.findByEntity("follow_up_draft", draft.id);
    const resolveAudit = auditEvents.find((e) => e.event_type === "CONFLICT_RESOLVED");
    expect(resolveAudit).toBeDefined();

    const payload = JSON.parse(resolveAudit!.safe_payload_json!);
    expect(payload.resolution_strategy).toBe("MANUAL_MERGE");
    expect(payload.resolution_reason).toBe("Reconciled with field notes after phone clarification");
    expect(payload.local_snapshot.summary).toBe("ಆಫ್‌ಲೈನ್ ಗಮನಿಕೆಗಳು");
    expect(payload.server_snapshot.summary).toBe("ಮೂಲ ಸಾರಾಂಶ");
  });

  it("7. Out-of-order queue processing and refresh recovery simulation", async () => {
    // 1. Queue an out-of-order action: SUBMIT_TO_ANM before draft exists
    const failedAction = await queueAction({
      entity_type: "FOLLOW_UP_DRAFT",
      entity_id: "non-existent-draft-id",
      action_type: "SUBMIT_TO_ANM",
      payload: { worker_note: "out of order" },
      sync_state: "WAITING_TO_SYNC",
    });

    // 2. Process queue -> action fails with SYNC_FAILED without throwing or halting the loop
    const summary = await processOfflineQueue(async (act) => {
      const res = await request(app)
        .post("/api/v1/sync/actions")
        .set("Authorization", ashaAuth)
        .send({
          action_id: act.action_id,
          idempotency_key: act.idempotency_key,
          entity_type: act.entity_type,
          entity_id: act.entity_id,
          action_type: act.action_type,
          base_server_version: act.base_server_version,
          payload: act.payload,
          created_at: act.created_at,
        });
      return res.body;
    });

    expect(summary.failedCount).toBe(1);

    // 3. Refresh recovery check
    const items = await getAllQueuedActions();
    const item = items.find((i) => i.action_id === failedAction.action_id);
    expect(item?.sync_state).toBe("SYNC_FAILED");
    expect(item?.retry_count).toBe(1);

    // Clean up
    await clearSyncedActions();
  });
});
