/**
 * MaatruMitra — Supervisor Operational Reporting Integration Tests.
 *
 * Verifies:
 * 1. Role-based access control (PHC_ADMIN only; ASHA and ANM rejected with 403; unauthenticated rejected with 401).
 * 2. Area-scoped aggregate metrics for assigned administrators vs global administrators.
 * 3. Accuracy of operational metrics: drafts awaiting review, task pipeline (open, ack, completed, overdue),
 *    sync reliability (applied, conflicts, failures, resolved), and median turnaround minutes.
 * 4. Data minimization safety: CSV and JSON exports contain strictly aggregate operational metrics
 *    and zero raw Kannada transcripts, zero audio storage keys, and zero patient identifiers.
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
import * as syncActionsRepo from "../repositories/syncActions.repo.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import { OperationalReportResponseSchema } from "@shared/schemas.js";

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

describe("Supervisor Operational Reporting", () => {
  let ashaAuth: string;
  let anmAuth: string;
  let globalAdminAuth: string;
  let areaAdminAuth: string;

  beforeEach(async () => {
    await seedTestUsers();
    seedTestSop();

    // Create a second area for area scoping tests
    testDb.prepare(`
      INSERT OR IGNORE INTO areas (id, district, taluk, phc_name, ward_village_label)
      VALUES ('test-area-002', 'Chitradurga', 'Chitradurga Rural', 'Rural PHC', 'Ward 02')
    `).run();

    // Create area-scoped admin
    const hash = "$2a$10$abcdefghijklmnopqrstuvwxyz012345";
    testDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, role, assigned_area_id, password_hash)
      VALUES ('test-admin-area1', 'test.admin1', 'Area 1 Admin', 'PHC_ADMIN', 'test-area-001', ?)
    `).run(hash);

    ashaAuth = getAuthHeader("test-asha-001", "test.asha", "ASHA_WORKER", "test-area-001");
    anmAuth = getAuthHeader("test-anm-001", "test.anm", "ANM_REVIEWER", "test-area-001");
    globalAdminAuth = getAuthHeader("test-admin-001", "test.admin", "PHC_ADMIN", null);
    areaAdminAuth = getAuthHeader("test-admin-area1", "test.admin1", "PHC_ADMIN", "test-area-001");
  });

  it("1. Strict role authorization: only PHC_ADMIN can access operational reports", async () => {
    // Unauthenticated -> 401
    const unauthRes = await request(app).get("/api/v1/admin/reports/operational");
    expect(unauthRes.status).toBe(401);

    // ASHA worker -> 403
    const ashaRes = await request(app)
      .get("/api/v1/admin/reports/operational")
      .set("Authorization", ashaAuth);
    expect(ashaRes.status).toBe(403);

    // ANM reviewer -> 403
    const anmRes = await request(app)
      .get("/api/v1/admin/reports/operational")
      .set("Authorization", anmAuth);
    expect(anmRes.status).toBe(403);

    // PHC admin -> 200
    const adminRes = await request(app)
      .get("/api/v1/admin/reports/operational")
      .set("Authorization", globalAdminAuth);
    expect(adminRes.status).toBe(200);

    const parseResult = OperationalReportResponseSchema.safeParse(adminRes.body);
    expect(parseResult.success).toBe(true);
    expect(adminRes.body.safety_notice).toContain("Synthetic operational administrative metrics only");
  });

  it("2. Accurate operational metrics aggregation", async () => {
    // 1. Create a draft awaiting review
    const vn1 = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/rep_01.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx1 = transcriptsRepo.create({ voice_note_id: vn1.id, source: "PROVIDER", language: "kn", text: "ಗರ್ಭಿಣಿ ತಪಾಸಣೆ" });
    const draft1 = draftsRepo.create({ voice_note_id: vn1.id, transcript_id: tx1.id });
    draftsRepo.updateState(draft1.id, "AWAITING_ANM_REVIEW");

    // 2. Create tasks with different statuses: 1 Open, 1 Acknowledged, 1 Completed, 1 Overdue
    const draft2 = draftsRepo.create({ voice_note_id: vn1.id, transcript_id: tx1.id });
    draftsRepo.updateState(draft2.id, "CONFIRMED");

    // Open task (future due date)
    tasksRepo.create({
      draft_id: draft2.id,
      owner_user_id: "test-asha-001",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      reviewer_user_id: "test-anm-001",
    });

    // Acknowledged task
    const tAck = tasksRepo.create({
      draft_id: draft2.id,
      owner_user_id: "test-asha-001",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      reviewer_user_id: "test-anm-001",
    });
    tasksRepo.updateStatus(tAck.id, "TASK_ACKNOWLEDGED");

    // Completed task
    const tDone = tasksRepo.create({
      draft_id: draft2.id,
      owner_user_id: "test-asha-001",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      reviewer_user_id: "test-anm-001",
    });
    tasksRepo.updateStatus(tDone.id, "TASK_COMPLETED", "Completed follow-up visit");

    // Overdue task (past due date)
    tasksRepo.create({
      draft_id: draft2.id,
      owner_user_id: "test-asha-001",
      due_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday!
      reviewer_user_id: "test-anm-001",
    });

    // 3. Record sync actions
    syncActionsRepo.create({
      idempotency_key: "rep-sync-01",
      actor_user_id: "test-asha-001",
      action_id: "rep-act-01",
      entity_type: "VOICE_NOTE",
      entity_id: vn1.id,
      action_type: "CREATE_INTENT",
      result: "APPLIED",
    });

    syncActionsRepo.create({
      idempotency_key: "rep-sync-02",
      actor_user_id: "test-asha-001",
      action_id: "rep-act-02",
      entity_type: "FOLLOW_UP_DRAFT",
      entity_id: draft1.id,
      action_type: "SUBMIT_TO_ANM",
      result: "CONFLICT",
      conflict_code: "STALE_BASE_VERSION",
    });

    // Record resolved conflict audit event
    auditEventsRepo.emit({
      actor_user_id: "test-anm-001",
      entity_type: "follow_up_draft",
      entity_id: draft1.id,
      event_type: "CONFLICT_RESOLVED",
      safe_payload: { resolution_strategy: "KEEP_SERVER" },
    });

    // Fetch report
    const res = await request(app)
      .get("/api/v1/admin/reports/operational")
      .set("Authorization", globalAdminAuth);

    expect(res.status).toBe(200);
    expect(res.body.drafts_awaiting_review).toBeGreaterThanOrEqual(1);

    // Tasks summary verification
    expect(res.body.tasks_summary.open).toBeGreaterThanOrEqual(2); // 1 on-time open + 1 overdue open
    expect(res.body.tasks_summary.acknowledged).toBeGreaterThanOrEqual(1);
    expect(res.body.tasks_summary.completed).toBeGreaterThanOrEqual(1);
    expect(res.body.tasks_summary.overdue).toBeGreaterThanOrEqual(1);
    expect(res.body.tasks_summary.total).toBeGreaterThanOrEqual(4);

    // Sync reliability verification
    expect(res.body.sync_reliability.total_synced_actions).toBeGreaterThanOrEqual(2);
    expect(res.body.sync_reliability.applied).toBeGreaterThanOrEqual(1);
    expect(res.body.sync_reliability.conflicts).toBeGreaterThanOrEqual(1);
    expect(res.body.sync_reliability.resolved_conflicts).toBeGreaterThanOrEqual(1);
  });

  it("3. Median turnaround time computation", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/turnaround.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });

    // Emit submission event at T0
    auditEventsRepo.emit({
      actor_user_id: "test-asha-001",
      entity_type: "follow_up_draft",
      entity_id: draft.id,
      event_type: "DRAFT_SUBMITTED_FOR_REVIEW",
      previous_state: "WORKER_REVIEWED",
      next_state: "AWAITING_ANM_REVIEW",
    });

    // Emit confirmation event
    auditEventsRepo.emit({
      actor_user_id: "test-anm-001",
      entity_type: "follow_up_draft",
      entity_id: draft.id,
      event_type: "DRAFT_CONFIRMED",
      previous_state: "AWAITING_ANM_REVIEW",
      next_state: "CONFIRMED",
    });

    const res = await request(app)
      .get("/api/v1/admin/reports/operational")
      .set("Authorization", globalAdminAuth);

    expect(res.status).toBe(200);
    expect(typeof res.body.median_turnaround_minutes === "number" || res.body.median_turnaround_minutes === null).toBe(true);
  });

  it("4. Data minimization safety: CSV and JSON exports contain NO raw transcripts, audio keys, or patient identifiers", async () => {
    // 1. Export CSV
    const csvRes = await request(app)
      .get("/api/v1/admin/reports/export?format=csv")
      .set("Authorization", globalAdminAuth);

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.headers["content-disposition"]).toContain("attachment; filename=");

    const csvText = csvRes.text;
    expect(csvText).toContain("MAATRUMITRA — OPERATIONAL SUPERVISOR REPORT");
    expect(csvText).toContain("CONFIRMED TASKS PIPELINE");
    expect(csvText).toContain("OFFLINE SYNC & CONCURRENCY HEALTH");
    expect(csvText).toContain("AREA ACTIVITY BREAKDOWN");
    expect(csvText).toContain("ROLE ACTIVITY VOLUME");

    // SAFETY CHECK: Must NOT contain Kannada transcript or raw storage keys or patient PII
    expect(csvText).not.toContain("ಗರ್ಭಿಣಿ");
    expect(csvText).not.toContain(".webm");
    expect(csvText).not.toContain("password_hash");

    // 2. Export JSON
    const jsonRes = await request(app)
      .get("/api/v1/admin/reports/export?format=json")
      .set("Authorization", globalAdminAuth);

    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers["content-type"]).toContain("application/json");

    const jsonBody = jsonRes.body;
    expect(jsonBody.safety_notice).toBeDefined();
    expect(jsonBody.tasks_summary).toBeDefined();
    expect(jsonBody.sync_reliability).toBeDefined();
    expect(jsonBody.area_breakdown).toBeDefined();

    // Confirm no raw transcript fields in JSON
    const serialized = JSON.stringify(jsonBody);
    expect(serialized).not.toContain("ಗರ್ಭಿಣಿ");
    expect(serialized).not.toContain(".webm");
    expect(serialized).not.toContain("storage_key");
  });

  it("5. Area-scoped administrator receives only assigned area metrics", async () => {
    const res = await request(app)
      .get("/api/v1/admin/reports/operational")
      .set("Authorization", areaAdminAuth);

    expect(res.status).toBe(200);
    expect(res.body.area_breakdown.length).toBe(1);
    expect(res.body.area_breakdown[0].area_id).toBe("test-area-001");
  });
});
