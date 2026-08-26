/**
 * MaatruMitra — Review workflow service.
 *
 * Handles the TRANSCRIPT_READY → WORKER_REVIEWED → AWAITING_ANM_REVIEW → CONFIRMED/REVISED/DISMISSED
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
import * as voiceNotesRepo from "../repositories/voiceNotes.repo.js";
import * as beneficiaryRepo from "../repositories/beneficiaryRefs.repo.js";
import { transitionDraft, transitionTask } from "./stateMachine.js";
import { PolicyError, NotFoundError, ForbiddenError } from "./errors.js";
import type { ANMConfirmSchema, ANMReviseSchema, ANMDismissSchema } from "@shared/schemas.js";
import type { z } from "zod";

// ── Draft Authorization ───────────────────────────────────────────────────────

export function getAuthorizedDraft(
  draftId: string,
  userId: string,
  userRole: string,
  userAreaId: string | null
): draftsRepo.FollowUpDraftRow {
  const draft = draftsRepo.findById(draftId);
  if (!draft) throw new NotFoundError("Draft not found.");

  const vn = voiceNotesRepo.findById(draft.voice_note_id);
  if (!vn) throw new NotFoundError("Associated voice note not found.");

  // ASHA can only see drafts they created
  if (userRole === "ASHA_WORKER") {
    if (vn.created_by_user_id !== userId) {
      throw new ForbiddenError("Access denied: you can only view drafts you created.");
    }
    return draft;
  }

  // ANM can only see drafts in their assigned area
  if (userRole === "ANM_REVIEWER") {
    const benRef = beneficiaryRepo.findById(vn.beneficiary_reference_id);
    if (!benRef || !userAreaId || benRef.area_id !== userAreaId) {
      throw new ForbiddenError("Access denied: draft belongs to a different area.");
    }
    return draft;
  }

  // PHC_ADMIN can view all if unassigned, or within assigned area
  if (userRole === "PHC_ADMIN") {
    if (userAreaId) {
      const benRef = beneficiaryRepo.findById(vn.beneficiary_reference_id);
      if (!benRef || benRef.area_id !== userAreaId) {
        throw new ForbiddenError("Access denied: draft belongs to a different area.");
      }
    }
    return draft;
  }

  throw new ForbiddenError("Access denied.");
}

// ── Worker actions ────────────────────────────────────────────────────────────

export function markWorkerReviewed(
  draftId: string,
  actorId: string,
  actorRole: string
): draftsRepo.FollowUpDraftRow {
  const draft = draftsRepo.findById(draftId);
  if (!draft) throw new NotFoundError("Follow-up draft not found.");

  const vn = voiceNotesRepo.findById(draft.voice_note_id);
  if (actorRole === "ASHA_WORKER" && vn && vn.created_by_user_id !== actorId) {
    throw new ForbiddenError("You can only review drafts for your own voice notes.");
  }

  if (draft.state !== "TRANSCRIPT_READY") {
    throw new PolicyError(
      `Draft must be in TRANSCRIPT_READY state to mark reviewed. Current state: ${draft.state}`,
      "ILLEGAL_DRAFT_TRANSITION"
    );
  }

  withTransaction(() => {
    transitionDraft(draftId, "TRANSCRIPT_READY", "WORKER_REVIEWED", actorId);
    draftsRepo.updateState(draftId, "WORKER_REVIEWED");
  });

  return draftsRepo.findById(draftId)!;
}

export function submitForReview(
  draftId: string,
  actorId: string,
  workerNote?: string,
  actorRole = "ASHA_WORKER"
): draftsRepo.FollowUpDraftRow {
  const draft = draftsRepo.findById(draftId);
  if (!draft) throw new NotFoundError("Follow-up draft not found.");

  const vn = voiceNotesRepo.findById(draft.voice_note_id);
  if (actorRole === "ASHA_WORKER" && vn && vn.created_by_user_id !== actorId) {
    throw new ForbiddenError("You can only submit your own drafts for review.");
  }

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

function assertDraftAwaitingReview(
  draftId: string,
  actorId: string,
  actorRole: string,
  actorAreaId: string | null
): { draft: draftsRepo.FollowUpDraftRow; benRef: beneficiaryRepo.BeneficiaryRefRow } {
  const draft = draftsRepo.findById(draftId);
  if (!draft) throw new NotFoundError("Follow-up draft not found.");

  const vn = voiceNotesRepo.findById(draft.voice_note_id);
  if (!vn) throw new NotFoundError("Associated voice note not found.");

  const benRef = beneficiaryRepo.findById(vn.beneficiary_reference_id);
  if (!benRef) throw new NotFoundError("Beneficiary reference not found.");

  const actor = usersRepo.findSafeById(actorId);
  const resolvedAreaId = actorAreaId ?? actor?.assigned_area_id ?? null;

  // Area enforcement for ANM
  if (actorRole === "ANM_REVIEWER") {
    if (resolvedAreaId && benRef.area_id !== resolvedAreaId) {
      throw new ForbiddenError("Access denied: draft belongs to a different area.");
    }
  } else if (actorRole === "PHC_ADMIN") {
    if (resolvedAreaId && benRef.area_id !== resolvedAreaId) {
      throw new ForbiddenError("Access denied: draft belongs to a different area.");
    }
  }

  if (draft.state !== "AWAITING_ANM_REVIEW") {
    throw new PolicyError(
      `Draft is in state ${draft.state}. Only AWAITING_ANM_REVIEW drafts can be confirmed, revised, or dismissed.`,
      "ILLEGAL_DRAFT_TRANSITION"
    );
  }
  return { draft, benRef };
}

export function confirm(
  draftId: string,
  actorId: string,
  input: z.infer<typeof ANMConfirmSchema>,
  actorRole = "ANM_REVIEWER",
  actorAreaId: string | null = null
): { draft: draftsRepo.FollowUpDraftRow; task: tasksRepo.TaskRow } {
  const { draft, benRef } = assertDraftAwaitingReview(draftId, actorId, actorRole, actorAreaId);

  // Validate proposed owner exists and is an active ASHA in the draft's area
  const owner = usersRepo.findSafeById(input.owner_user_id);
  if (!owner) throw new NotFoundError("Proposed task owner user not found.");
  if (owner.status !== "ACTIVE") {
    throw new PolicyError("Proposed task owner account is not active.", "INACTIVE_OWNER");
  }
  if (owner.role !== "ASHA_WORKER") {
    throw new PolicyError("Task owner must be an ASHA worker.", "INVALID_OWNER_ROLE");
  }
  if (owner.assigned_area_id !== benRef.area_id) {
    throw new ForbiddenError("Task owner must be an ASHA assigned to the draft's area.");
  }

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
  input: z.infer<typeof ANMReviseSchema>,
  actorRole = "ANM_REVIEWER",
  actorAreaId: string | null = null
): draftsRepo.FollowUpDraftRow {
  const { draft } = assertDraftAwaitingReview(draftId, actorId, actorRole, actorAreaId);

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
  input: z.infer<typeof ANMDismissSchema>,
  actorRole = "ANM_REVIEWER",
  actorAreaId: string | null = null
): draftsRepo.FollowUpDraftRow {
  assertDraftAwaitingReview(draftId, actorId, actorRole, actorAreaId);

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
    transitionTask(taskId, task.status, "TASK_ACKNOWLEDGED", actorId);
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
    transitionTask(taskId, task.status, "TASK_COMPLETED", actorId, {
      completion_note_provided: !!completionNote,
    });
    tasksRepo.updateStatus(taskId, "TASK_COMPLETED", {
      completed_at: now,
      completion_note: completionNote,
    });
  });

  return tasksRepo.findById(taskId)!;
}

