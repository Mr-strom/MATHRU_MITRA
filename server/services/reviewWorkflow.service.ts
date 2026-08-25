/**
 * MaatruMitra — Review workflow service.
 *
 * Handles the WORKER_REVIEWED → AWAITING_ANM_REVIEW → CONFIRMED/REVISED/DISMISSED
 * state transitions for follow-up drafts, and creates follow-up tasks on confirmation.
 *
 * SAFETY:
 * - No clinical decisions are made here.
 * - No automatic messaging is initiated.
 * - Every transition emits an audit event via the state machine service.
 */

import { withTransaction } from "../db/client.js";
import * as draftsRepo from "../repositories/followUpDrafts.repo.js";
import * as tasksRepo from "../repositories/tasks.repo.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import * as usersRepo from "../repositories/users.repo.js";
import { transitionDraft, transitionTask } from "./stateMachine.js";
import { PolicyError, NotFoundError, ForbiddenError } from "./errors.js";
import type { ANMConfirmSchema, ANMReviseSchema, ANMDismissSchema } from "@shared/schemas.js";
import type { z } from "zod";

// ── Worker actions ────────────────────────────────────────────────────────────

export function submitForReview(
  draftId: string,
  actorId: string,
  workerNote?: string
): draftsRepo.FollowUpDraftRow {
  const draft = draftsRepo.findById(draftId);
  if (!draft) throw new NotFoundError("Follow-up draft not found.");
  if (draft.state !== "WORKER_REVIEWED") {
    throw new PolicyError(
      `Draft must be in WORKER_REVIEWED state to submit for review. Current state: ${draft.state}`,
      "ILLEGAL_DRAFT_TRANSITION"
    );
  }

  withTransaction(() => {
    transitionDraft(draftId, "WORKER_REVIEWED", "AWAITING_ANM_REVIEW", actorId, {
      worker_note_provided: !!workerNote,
    });
    draftsRepo.updateState(draftId, "AWAITING_ANM_REVIEW");
  });

  return draftsRepo.findById(draftId)!;
}

// ── ANM actions ───────────────────────────────────────────────────────────────

function assertDraftAwaitingReview(draftId: string): draftsRepo.FollowUpDraftRow {
  const draft = draftsRepo.findById(draftId);
  if (!draft) throw new NotFoundError("Follow-up draft not found.");
  if (draft.state !== "AWAITING_ANM_REVIEW") {
    throw new PolicyError(
      `Draft is in state ${draft.state}. Only AWAITING_ANM_REVIEW drafts can be confirmed, revised, or dismissed.`,
      "ILLEGAL_DRAFT_TRANSITION"
    );
  }
  return draft;
}

export function confirm(
  draftId: string,
  actorId: string,
  input: z.infer<typeof ANMConfirmSchema>
): { draft: draftsRepo.FollowUpDraftRow; task: tasksRepo.TaskRow } {
  const draft = assertDraftAwaitingReview(draftId);

  // Validate proposed owner exists
  const owner = usersRepo.findSafeById(input.owner_user_id);
  if (!owner) throw new NotFoundError("Proposed task owner user not found.");

  const now = new Date().toISOString();
  let task!: tasksRepo.TaskRow;

  withTransaction(() => {
    transitionDraft(draftId, "AWAITING_ANM_REVIEW", "CONFIRMED", actorId, {
      reviewer_note_provided: !!input.reviewer_note,
      owner_role: owner.role,
    });
    draftsRepo.updateState(draftId, "CONFIRMED", {
      proposed_owner_user_id: input.owner_user_id,
      proposed_due_at: input.due_at,
    });

    // Create the follow-up task
    task = tasksRepo.create({
      draft_id: draftId,
      owner_user_id: input.owner_user_id,
      due_at: input.due_at,
      reviewer_user_id: actorId,
      reviewer_note: input.reviewer_note,
      confirmed_at: now,
    });

    auditEventsRepo.emit({
      actor_user_id: actorId,
      entity_type: "follow_up_task",
      entity_id: task.id,
      event_type: "TASK_CREATED",
      next_state: "TASK_OPEN",
      safe_payload: {
        draft_id: draftId,
        owner_role: owner.role,
        due_at: input.due_at,
      },
    });
  });

  return { draft: draftsRepo.findById(draftId)!, task };
}

export function revise(
  draftId: string,
  actorId: string,
  input: z.infer<typeof ANMReviseSchema>
): draftsRepo.FollowUpDraftRow {
  const draft = assertDraftAwaitingReview(draftId);

  withTransaction(() => {
    transitionDraft(draftId, "AWAITING_ANM_REVIEW", "REVISED", actorId, {
      fields_changed: Object.keys(input).filter((k) => k !== "reviewer_note"),
    });
    draftsRepo.updateState(draftId, "REVISED", {
      proposed_owner_user_id: input.owner_user_id ?? draft.proposed_owner_user_id,
      proposed_due_at: input.due_at ?? draft.proposed_due_at,
      summary: input.revised_summary ?? draft.summary,
    });
  });

  return draftsRepo.findById(draftId)!;
}

export function dismiss(
  draftId: string,
  actorId: string,
  input: z.infer<typeof ANMDismissSchema>
): draftsRepo.FollowUpDraftRow {
  assertDraftAwaitingReview(draftId);

  withTransaction(() => {
    transitionDraft(draftId, "AWAITING_ANM_REVIEW", "DISMISSED", actorId, {
      reason_length: input.reason.length,
    });
    draftsRepo.updateState(draftId, "DISMISSED");
  });

  return draftsRepo.findById(draftId)!;
}

// ── Task actions ──────────────────────────────────────────────────────────────

export function acknowledgeTask(taskId: string, actorId: string): tasksRepo.TaskRow {
  const task = tasksRepo.findById(taskId);
  if (!task) throw new NotFoundError("Task not found.");
  if (task.owner_user_id !== actorId) {
    throw new ForbiddenError("Only the assigned task owner can acknowledge a task.");
  }

  withTransaction(() => {
    transitionTask(taskId, "TASK_OPEN", "TASK_ACKNOWLEDGED", actorId);
    tasksRepo.updateStatus(taskId, "TASK_ACKNOWLEDGED");
  });

  return tasksRepo.findById(taskId)!;
}

export function completeTask(
  taskId: string,
  actorId: string,
  completionNote?: string
): tasksRepo.TaskRow {
  const task = tasksRepo.findById(taskId);
  if (!task) throw new NotFoundError("Task not found.");
  if (task.owner_user_id !== actorId) {
    throw new ForbiddenError("Only the assigned task owner can complete a task.");
  }

  const now = new Date().toISOString();
  withTransaction(() => {
    transitionTask(taskId, "TASK_ACKNOWLEDGED", "TASK_COMPLETED", actorId, {
      completion_note_provided: !!completionNote,
    });
    tasksRepo.updateStatus(taskId, "TASK_COMPLETED", {
      completed_at: now,
      completion_note: completionNote,
    });
  });

  return tasksRepo.findById(taskId)!;
}
