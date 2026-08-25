/**
 * MaatruMitra — State machine service.
 *
 * The single authoritative place for state transition validation.
 * Every transition emits an immutable audit event.
 * Illegal transitions throw PolicyError.
 */

import {
  DRAFT_TRANSITIONS,
  TASK_TRANSITIONS,
  type DraftState,
  type TaskState,
} from "@shared/states.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import { PolicyError } from "./errors.js";

export function transitionDraft(
  entityId: string,
  from: DraftState,
  to: DraftState,
  actorId: string | null,
  safePayload?: Record<string, unknown>
): void {
  const allowed = DRAFT_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new PolicyError(
      `Draft state transition ${from} → ${to} is not permitted.`,
      "ILLEGAL_DRAFT_TRANSITION"
    );
  }
  auditEventsRepo.emit({
    actor_user_id: actorId,
    entity_type: "follow_up_draft",
    entity_id: entityId,
    event_type: "STATE_TRANSITION",
    previous_state: from,
    next_state: to,
    safe_payload: safePayload,
  });
}

export function transitionTask(
  entityId: string,
  from: TaskState,
  to: TaskState,
  actorId: string | null,
  safePayload?: Record<string, unknown>
): void {
  const allowed = TASK_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new PolicyError(
      `Task state transition ${from} → ${to} is not permitted.`,
      "ILLEGAL_TASK_TRANSITION"
    );
  }
  auditEventsRepo.emit({
    actor_user_id: actorId,
    entity_type: "follow_up_task",
    entity_id: entityId,
    event_type: "STATE_TRANSITION",
    previous_state: from,
    next_state: to,
    safe_payload: safePayload,
  });
}
