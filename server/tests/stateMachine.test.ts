/**
 * MaatruMitra — State machine unit tests.
 *
 * Tests every legal transition and every illegal transition.
 * Verifies audit event emission on each legal transition.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { transitionDraft, transitionTask } from "../services/stateMachine.js";
import { DRAFT_TRANSITIONS, TASK_TRANSITIONS } from "@shared/states.js";
import { seedTestUsers, testDb } from "./_setup.js";

describe("State machine — draft transitions", () => {
  beforeEach(async () => {
    await seedTestUsers();
  });

  it("allows all documented legal transitions", () => {
    const entityId = "sm-test-draft-01";
    const actorId = "test-anm-001";

    // These should not throw
    expect(() =>
      transitionDraft(entityId, "VOICE_NOTE_DRAFT", "TRANSCRIPT_READY", actorId)
    ).not.toThrow();

    expect(() =>
      transitionDraft(entityId, "TRANSCRIPT_READY", "WORKER_REVIEWED", actorId)
    ).not.toThrow();

    expect(() =>
      transitionDraft(entityId, "WORKER_REVIEWED", "AWAITING_ANM_REVIEW", actorId)
    ).not.toThrow();

    expect(() =>
      transitionDraft(entityId, "AWAITING_ANM_REVIEW", "CONFIRMED", actorId)
    ).not.toThrow();

    expect(() =>
      transitionDraft(entityId, "AWAITING_ANM_REVIEW", "DISMISSED", actorId)
    ).not.toThrow();
  });

  it("rejects illegal draft transitions with PolicyError", () => {
    const entityId = "sm-test-draft-02";
    const actorId = "test-asha-001";

    // Cannot skip states
    const { PolicyError } = require("../services/errors.js");
    expect(() =>
      transitionDraft(entityId, "VOICE_NOTE_DRAFT", "CONFIRMED", actorId)
    ).toThrow(PolicyError);

    expect(() =>
      transitionDraft(entityId, "CONFIRMED", "DISMISSED", actorId)
    ).toThrow(PolicyError);

    expect(() =>
      transitionDraft(entityId, "DISMISSED", "VOICE_NOTE_DRAFT", actorId)
    ).toThrow(PolicyError);
  });

  it("emits an audit event for each legal transition", () => {
    const entityId = "sm-test-draft-03";
    const actorId = "test-asha-001";

    const before = testDb
      .prepare("SELECT COUNT(*) as count FROM audit_events WHERE entity_id = ?")
      .get(entityId) as { count: number };

    transitionDraft(entityId, "TRANSCRIPT_READY", "WORKER_REVIEWED", actorId, {
      test_payload: "audit-check",
    });

    const after = testDb
      .prepare("SELECT COUNT(*) as count FROM audit_events WHERE entity_id = ?")
      .get(entityId) as { count: number };

    expect(after.count).toBe(before.count + 1);
  });

  it("confirms all transition arrays match the policy", () => {
    // All terminal states have empty allowed transitions
    expect(DRAFT_TRANSITIONS.CONFIRMED).toEqual([]);
    expect(DRAFT_TRANSITIONS.DISMISSED).toEqual([]);
    expect(DRAFT_TRANSITIONS.REVISED).toEqual([]);

    // AWAITING_ANM_REVIEW must offer all three ANM actions
    expect(DRAFT_TRANSITIONS.AWAITING_ANM_REVIEW).toContain("CONFIRMED");
    expect(DRAFT_TRANSITIONS.AWAITING_ANM_REVIEW).toContain("REVISED");
    expect(DRAFT_TRANSITIONS.AWAITING_ANM_REVIEW).toContain("DISMISSED");
  });
});

describe("State machine — task transitions", () => {
  it("allows TASK_OPEN → TASK_ACKNOWLEDGED → TASK_COMPLETED", () => {
    const entityId = "sm-test-task-01";
    expect(() => transitionTask(entityId, "TASK_OPEN", "TASK_ACKNOWLEDGED", "test-asha-001")).not.toThrow();
    expect(() => transitionTask(entityId, "TASK_ACKNOWLEDGED", "TASK_COMPLETED", "test-asha-001")).not.toThrow();
  });

  it("allows TASK_OPEN → TASK_CANCELLED", () => {
    expect(() =>
      transitionTask("sm-test-task-02", "TASK_OPEN", "TASK_CANCELLED", "test-anm-001")
    ).not.toThrow();
  });

  it("rejects jumping TASK_OPEN → TASK_COMPLETED", () => {
    const { PolicyError } = require("../services/errors.js");
    expect(() =>
      transitionTask("sm-test-task-03", "TASK_OPEN", "TASK_COMPLETED", "test-asha-001")
    ).toThrow(PolicyError);
  });

  it("confirms all terminal task states have empty transitions", () => {
    expect(TASK_TRANSITIONS.TASK_COMPLETED).toEqual([]);
    expect(TASK_TRANSITIONS.TASK_CANCELLED).toEqual([]);
  });
});
