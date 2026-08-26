/**
 * MaatruMitra — Workflow service integration tests.
 * Uses in-memory DB + real repository layer.
 * Tests the full state machine path from draft creation to task completion.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { seedTestUsers, seedTestSop, testDb } from "./_setup.js";
import * as voiceNotesRepo from "../repositories/voiceNotes.repo.js";
import * as transcriptsRepo from "../repositories/transcripts.repo.js";
import * as draftsRepo from "../repositories/followUpDrafts.repo.js";
import * as tasksRepo from "../repositories/tasks.repo.js";
import * as reviewWorkflow from "../services/reviewWorkflow.service.js";
import { PolicyError } from "../services/errors.js";
import { ANMDismissSchema } from "@shared/schemas.js";

// ── Test fixture builders ─────────────────────────────────────────────────────

function createVoiceNote(userId = "test-asha-001") {
  return voiceNotesRepo.create({
    beneficiary_reference_id: "test-ben-001",
    created_by_user_id: userId,
    storage_key: `${userId}/test-audio-${Date.now()}.webm`,
    mime_type: "audio/webm",
    byte_size: 4096,
    language_declared: "kn",
  });
}

function createTranscript(voiceNoteId: string) {
  return transcriptsRepo.create({
    voice_note_id: voiceNoteId,
    source: "PROVIDER",
    language: "kn",
    text: "ಎರಡು ವಾರದಿಂದ ಐರನ್ ಮಾತ್ರೆ ತಪ್ಪಿದೆ",
    provider_name: "fake",
  });
}

function createDraftInWorkerReviewedState(voiceNoteId: string, transcriptId: string) {
  const draft = draftsRepo.create({
    voice_note_id: voiceNoteId,
    transcript_id: transcriptId,
    administrative_category: "SUPPLEMENT_ROUTINE_NOTE",
    summary: "Test administrative summary for worker observation.",
  });
  // Move to WORKER_REVIEWED
  draftsRepo.updateState(draft.id, "WORKER_REVIEWED");
  return draftsRepo.findById(draft.id)!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Review workflow — submit for review", () => {
  beforeEach(async () => {
    await seedTestUsers();
    seedTestSop();
  });

  it("transitions WORKER_REVIEWED → AWAITING_ANM_REVIEW and emits audit event", () => {
    const vn = createVoiceNote();
    const tx = createTranscript(vn.id);
    const draft = createDraftInWorkerReviewedState(vn.id, tx.id);

    const updated = reviewWorkflow.submitForReview(draft.id, "test-asha-001");
    expect(updated.state).toBe("AWAITING_ANM_REVIEW");

    const events = testDb
      .prepare("SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'STATE_TRANSITION'")
      .all(draft.id) as Array<{ previous_state: string; next_state: string }>;

    const transition = events.find((e) => e.next_state === "AWAITING_ANM_REVIEW");
    expect(transition).toBeDefined();
    expect(transition?.previous_state).toBe("WORKER_REVIEWED");
  });

  it("rejects submitForReview if draft is not in WORKER_REVIEWED state", () => {
    const vn = createVoiceNote();
    const tx = createTranscript(vn.id);
    const draft = draftsRepo.create({ voice_note_id: vn.id, transcript_id: tx.id });

    // Draft is in TRANSCRIPT_READY, not WORKER_REVIEWED
    expect(() =>
      reviewWorkflow.submitForReview(draft.id, "test-asha-001")
    ).toThrow(PolicyError);
  });
});

describe("Review workflow — ANM confirm", () => {
  beforeEach(async () => {
    await seedTestUsers();
    seedTestSop();
  });

  function createAwaitingDraft() {
    const vn = createVoiceNote();
    const tx = createTranscript(vn.id);
    const draft = createDraftInWorkerReviewedState(vn.id, tx.id);
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");
    return draftsRepo.findById(draft.id)!;
  }

  it("confirms a draft and creates a TASK_OPEN task", () => {
    const draft = createAwaitingDraft();
    const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const result = reviewWorkflow.confirm(draft.id, "test-anm-001", {
      owner_user_id: "test-asha-001",
      due_at: due,
      reviewer_note: "Please schedule a home visit.",
    });

    expect(result.draft.state).toBe("CONFIRMED");
    expect(result.task.status).toBe("TASK_OPEN");
    expect(result.task.owner_user_id).toBe("test-asha-001");
    expect(result.task.reviewer_user_id).toBe("test-anm-001");
  });

  it("creates exactly one task per confirmed draft", () => {
    const draft = createAwaitingDraft();
    const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    reviewWorkflow.confirm(draft.id, "test-anm-001", {
      owner_user_id: "test-asha-001",
      due_at: due,
    });

    const tasks = testDb
      .prepare("SELECT * FROM follow_up_tasks WHERE draft_id = ?")
      .all(draft.id) as unknown[];
    expect(tasks.length).toBe(1);
  });

  it("rejects double-confirmation", () => {
    const draft = createAwaitingDraft();
    const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    reviewWorkflow.confirm(draft.id, "test-anm-001", {
      owner_user_id: "test-asha-001",
      due_at: due,
    });

    // Draft is now CONFIRMED — second confirm should throw
    expect(() =>
      reviewWorkflow.confirm(draft.id, "test-anm-001", {
        owner_user_id: "test-asha-001",
        due_at: due,
      })
    ).toThrow(PolicyError);
  });

  it("dismiss transitions draft to DISMISSED", () => {
    const draft = createAwaitingDraft();
    const result = reviewWorkflow.dismiss(draft.id, "test-anm-001", {
      reason: "Duplicate entry — already followed up.",
    });
    expect(result.state).toBe("DISMISSED");
  });

  it("rejects dismissal without a reason", () => {
    // ANMDismissSchema requires reason.min(1)
    const r = ANMDismissSchema.safeParse({ reason: "" });
    expect(r.success).toBe(false);
  });
});

describe("Review workflow — task lifecycle", () => {
  beforeEach(async () => {
    await seedTestUsers();
    seedTestSop();
  });

  function createOpenTask() {
    const vn = createVoiceNote();
    const tx = createTranscript(vn.id);
    const draft = createDraftInWorkerReviewedState(vn.id, tx.id);
    draftsRepo.updateState(draft.id, "AWAITING_ANM_REVIEW");
    const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { task } = reviewWorkflow.confirm(draft.id, "test-anm-001", {
      owner_user_id: "test-asha-001",
      due_at: due,
    });
    return task;
  }

  it("acknowledges a TASK_OPEN task", () => {
    const task = createOpenTask();
    const updated = reviewWorkflow.acknowledgeTask(task.id, "test-asha-001");
    expect(updated.status).toBe("TASK_ACKNOWLEDGED");
  });

  it("completes an acknowledged task", () => {
    const task = createOpenTask();
    reviewWorkflow.acknowledgeTask(task.id, "test-asha-001");
    const completed = reviewWorkflow.completeTask(task.id, "test-asha-001", "Visited the household.");
    expect(completed.status).toBe("TASK_COMPLETED");
    expect(completed.completed_at).toBeTruthy();
  });

  it("rejects acknowledgement by non-owner", () => {
    const task = createOpenTask();
    expect(() =>
      reviewWorkflow.acknowledgeTask(task.id, "test-anm-001")
    ).toThrow(); // ForbiddenError
  });

  it("rejects skipping directly to TASK_COMPLETED without acknowledgement", () => {
    const task = createOpenTask();
    // TASK_OPEN → TASK_COMPLETED is an illegal skip
    expect(() =>
      reviewWorkflow.completeTask(task.id, "test-asha-001")
    ).toThrow(PolicyError);
  });

  it("records a no-automated-message notice in task completion audit", () => {
    const task = createOpenTask();
    reviewWorkflow.acknowledgeTask(task.id, "test-asha-001");
    reviewWorkflow.completeTask(task.id, "test-asha-001", "Demo complete.");

    const events = testDb
      .prepare("SELECT * FROM audit_events WHERE entity_id = ? ORDER BY created_at ASC")
      .all(task.id) as Array<{ event_type: string; next_state: string }>;

    const completionEvent = events.find((e) => e.next_state === "TASK_COMPLETED");
    expect(completionEvent).toBeDefined();
    // No messaging fields in safe_payload
    const allPayloads = events.map((e) => (e as Record<string, string>).safe_payload_json ?? "{}").join(" ");
    expect(allPayloads).not.toContain("sms");
    expect(allPayloads).not.toContain("whatsapp");
    expect(allPayloads).not.toContain("message_sent");
  });
});
