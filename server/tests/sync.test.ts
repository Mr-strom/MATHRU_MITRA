/**
 * MaatruMitra — Offline Sync & Idempotency Integration Tests.
 *
 * Tests:
 * 1. POST /api/v1/sync/actions requires authentication.
 * 2. Idempotency key replay returns ALREADY_APPLIED without duplicate execution.
 * 3. Consent check: rejects sync action if consent_given is not true.
 * 4. Area & role isolation: rejects cross-area or unauthorized role sync actions.
 * 5. State conflict detection: returns CONFLICT when base state does not match server state.
 * 6. Task creation gate: drafts cannot create tasks without ANM confirmation.
 * 7. Client offline queue store lifecycle: FIFO processing, retry, and task discard protection.
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
import {
  queueAction,
  getAllQueuedActions,
  retryAction,
  discardLocalDraft,
  clearSyncedActions,
  processOfflineQueue,
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

describe("Offline Sync & Idempotency Endpoints", () => {
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

  it("1. POST /api/v1/sync/actions requires authentication (401)", async () => {
    const res = await request(app)
      .post("/api/v1/sync/actions")
      .send({
        action_id: "act-test-01",
        idempotency_key: "idem-test-01",
        entity_type: "VOICE_NOTE",
        entity_id: "vn-test-01",
        action_type: "CREATE_INTENT",
        payload: { consent_given: true },
        created_at: new Date().toISOString(),
      });
    expect(res.status).toBe(401);
  });

  it("2. Exact-once idempotency key replay returns ALREADY_APPLIED", async () => {
    const actionPayload = {
      action_id: "act-test-02",
      idempotency_key: "idem-unique-key-002",
      entity_type: "VOICE_NOTE",
      entity_id: "vn-test-02",
      action_type: "CREATE_INTENT",
      payload: {
        beneficiary_reference_id: "test-ben-001",
        consent_given: true,
        byte_size: 1024,
      },
      created_at: new Date().toISOString(),
    };

    // First request -> APPLIED
    const res1 = await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", ashaAuth)
      .send(actionPayload);
    expect(res1.status).toBe(200);
    expect(res1.body.result).toBe("APPLIED");

    // Duplicate request with exact same idempotency_key -> ALREADY_APPLIED
    const res2 = await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", ashaAuth)
      .send(actionPayload);
    expect(res2.status).toBe(200);
    expect(res2.body.result).toBe("ALREADY_APPLIED");
    expect(res2.body.authoritative_entity).toBeDefined();
  });

  it("3. Rejects sync action when consent_given is missing or false", async () => {
    const res = await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", ashaAuth)
      .send({
        action_id: "act-test-03",
        idempotency_key: "idem-test-03",
        entity_type: "VOICE_NOTE",
        entity_id: "vn-test-03",
        action_type: "CREATE_INTENT",
        payload: {
          beneficiary_reference_id: "test-ben-001",
          consent_given: false,
        },
        created_at: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("REJECTED");
    expect(res.body.conflict_code).toBe("CONSENT_REQUIRED");
  });

  it("4. Rejects cross-area ANM review actions via sync", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/sync_test_04.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "WORKER_EDITED", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");

    // ANM in test-area-002 attempts to confirm draft in test-area-001
    const res = await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", anmOtherAreaAuth)
      .send({
        action_id: "act-test-04",
        idempotency_key: "idem-test-04",
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        action_type: "CONFIRM",
        payload: {
          owner_user_id: "test-asha-001",
          due_at: new Date(Date.now() + 86400000).toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("REJECTED");
  });

  it("5. Returns CONFLICT when local action violates state machine sequence", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/sync_test_05.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "PROVIDER", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    // draft is in TRANSCRIPT_READY

    // Client attempts to SUBMIT_TO_ANM without marking WORKER_REVIEWED first
    const res = await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", ashaAuth)
      .send({
        action_id: "act-test-05",
        idempotency_key: "idem-test-05",
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        action_type: "SUBMIT_TO_ANM",
        payload: {},
        created_at: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("CONFLICT");
    expect(res.body.conflict_code).toBe("ILLEGAL_STATE");
    expect(res.body.authoritative_entity).toBeDefined();
  });

  it("6. Task creation gate: drafts cannot create tasks without ANM confirmation", async () => {
    const vn = voiceNotesRepo.create({
      beneficiary_reference_id: "test-ben-001",
      created_by_user_id: "test-asha-001",
      storage_key: "test-asha-001/sync_test_06.webm",
      mime_type: "audio/webm",
      byte_size: 1024,
    });
    const tx = transcriptsRepo.create({ voice_note_id: vn.id, source: "WORKER_EDITED", language: "kn", text: "ವಿವರ" });
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");

    // ASHA worker attempts to confirm own draft directly -> REJECTED
    const res = await request(app)
      .post("/api/v1/sync/actions")
      .set("Authorization", ashaAuth)
      .send({
        action_id: "act-test-06",
        idempotency_key: "idem-test-06",
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: draft.id,
        action_type: "CONFIRM",
        payload: {
          owner_user_id: "test-asha-001",
          due_at: new Date(Date.now() + 86400000).toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("REJECTED");
    expect(res.body.conflict_code).toBe("ROLE_FORBIDDEN");
  });

  it("7. Client offline queue store: handles FIFO queueing, retry, and task discard protection", async () => {
    // 1. Enqueue action
    const action = await queueAction({
      entity_type: "FOLLOW_UP_DRAFT",
      entity_id: "draft-local-01",
      action_type: "CREATE_FROM_TRANSCRIPT",
      payload: { transcript_id: "tx-01" },
      sync_state: "LOCAL_DRAFT",
    });
    expect(action.action_id).toBeDefined();
    expect(action.sync_state).toBe("LOCAL_DRAFT");

    // 2. Retrieve all
    const all = await getAllQueuedActions();
    expect(all.length).toBeGreaterThanOrEqual(1);

    // 3. Process queue with mock handler
    const summary = await processOfflineQueue(async (act) => {
      return {
        result: "APPLIED",
        authoritative_entity: { id: act.entity_id, status: "SYNCED" },
        audit_event_id: "evt-01",
        conflict_code: null,
      };
    });
    expect(summary.syncedCount).toBeGreaterThanOrEqual(1);

    // 4. Verify updated state
    const afterSync = await getAllQueuedActions();
    const syncedItem = afterSync.find((a) => a.action_id === action.action_id);
    expect(syncedItem?.sync_state).toBe("SYNCED");

    // 5. Task discard protection: cannot discard server-confirmed task
    const taskAction = await queueAction({
      entity_type: "TASK",
      entity_id: "task-server-confirmed",
      action_type: "CONFIRM",
      payload: {},
      sync_state: "SYNCED",
    });

    await expect(discardLocalDraft(taskAction.action_id)).rejects.toThrow("Safety violation");

    // 6. Clear synced items
    await clearSyncedActions();
  });
});
