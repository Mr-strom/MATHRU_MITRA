/**
 * MaatruMitra — State machine definitions.
 *
 * Deterministic state transition maps for follow-up drafts and tasks.
 * Illegal transitions throw a PolicyError at the service layer.
 *
 * State machine:
 *   VOICE_NOTE_DRAFT → TRANSCRIPT_READY → WORKER_REVIEWED → AWAITING_ANM_REVIEW
 *     → CONFIRMED | REVISED | DISMISSED
 *
 *   CONFIRMED → TASK_OPEN → TASK_ACKNOWLEDGED → TASK_COMPLETED | TASK_CANCELLED
 */

// ── Voice note states ─────────────────────────────────────────────────────────

export const VOICE_NOTE_STATES = {
  DRAFT: "DRAFT",
  PROCESSING: "PROCESSING",
  TRANSCRIPT_READY: "TRANSCRIPT_READY",
  FAILED: "FAILED",
} as const;

export type VoiceNoteState = (typeof VOICE_NOTE_STATES)[keyof typeof VOICE_NOTE_STATES];

// ── Follow-up draft states ────────────────────────────────────────────────────

export const DRAFT_STATES = {
  VOICE_NOTE_DRAFT: "VOICE_NOTE_DRAFT",
  TRANSCRIPT_READY: "TRANSCRIPT_READY",
  WORKER_REVIEWED: "WORKER_REVIEWED",
  AWAITING_ANM_REVIEW: "AWAITING_ANM_REVIEW",
  CONFIRMED: "CONFIRMED",
  REVISED: "REVISED",
  DISMISSED: "DISMISSED",
} as const;

export type DraftState = (typeof DRAFT_STATES)[keyof typeof DRAFT_STATES];

/** Allowed transitions for follow-up drafts. */
export const DRAFT_TRANSITIONS: Record<DraftState, DraftState[]> = {
  VOICE_NOTE_DRAFT: ["TRANSCRIPT_READY"],
  TRANSCRIPT_READY: ["WORKER_REVIEWED"],
  WORKER_REVIEWED: ["AWAITING_ANM_REVIEW"],
  AWAITING_ANM_REVIEW: ["CONFIRMED", "REVISED", "DISMISSED"],
  CONFIRMED: [],   // terminal — task is created on confirmation
  REVISED: [],     // terminal — re-submit creates a new draft
  DISMISSED: [],   // terminal
};

// ── Task states ───────────────────────────────────────────────────────────────

export const TASK_STATES = {
  TASK_OPEN: "TASK_OPEN",
  TASK_ACKNOWLEDGED: "TASK_ACKNOWLEDGED",
  TASK_COMPLETED: "TASK_COMPLETED",
  TASK_CANCELLED: "TASK_CANCELLED",
} as const;

export type TaskState = (typeof TASK_STATES)[keyof typeof TASK_STATES];

/** Allowed transitions for follow-up tasks. */
export const TASK_TRANSITIONS: Record<TaskState, TaskState[]> = {
  TASK_OPEN: ["TASK_ACKNOWLEDGED", "TASK_CANCELLED"],
  TASK_ACKNOWLEDGED: ["TASK_COMPLETED", "TASK_CANCELLED"],
  TASK_COMPLETED: [],
  TASK_CANCELLED: [],
};

// ── Background job states ─────────────────────────────────────────────────────

export const JOB_STATES = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const;

export type JobState = (typeof JOB_STATES)[keyof typeof JOB_STATES];

// ── Follow-up categories (administrative only) ────────────────────────────────

export const FOLLOW_UP_CATEGORIES = {
  MISSED_CONTACT: "MISSED_CONTACT",
  ROUTINE_HOME_VISIT: "ROUTINE_HOME_VISIT",
  SERVICE_VISIT_REMINDER: "SERVICE_VISIT_REMINDER",
  SUPPLEMENT_ROUTINE_NOTE: "SUPPLEMENT_ROUTINE_NOTE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  OTHER_ADMINISTRATIVE: "OTHER_ADMINISTRATIVE",
} as const;

export type FollowUpCategory =
  (typeof FOLLOW_UP_CATEGORIES)[keyof typeof FOLLOW_UP_CATEGORIES];

// ── Notification channel (always DISABLED in this build) ──────────────────────

export const NOTIFICATION_STATUS = {
  DISABLED: "DISABLED",
} as const;

// ── Offline sync states ───────────────────────────────────────────────────────

export const SYNC_STATES = {
  LOCAL_DRAFT: "LOCAL_DRAFT",
  WAITING_TO_SYNC: "WAITING_TO_SYNC",
  SYNCING: "SYNCING",
  SYNCED: "SYNCED",
  SYNC_FAILED: "SYNC_FAILED",
  CONFLICT_REVIEW_REQUIRED: "CONFLICT_REVIEW_REQUIRED",
} as const;

export type SyncState = (typeof SYNC_STATES)[keyof typeof SYNC_STATES];

// ── Conflict codes ────────────────────────────────────────────────────────────

export const CONFLICT_CODES = {
  STALE_BASE_VERSION: "STALE_BASE_VERSION",
  ILLEGAL_STATE: "ILLEGAL_STATE",
  STATE_MISMATCH: "STATE_MISMATCH",
  ROLE_FORBIDDEN: "ROLE_FORBIDDEN",
  AREA_MISMATCH: "AREA_MISMATCH",
  DECISION_LOCKED: "DECISION_LOCKED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
} as const;

export type ConflictCode = (typeof CONFLICT_CODES)[keyof typeof CONFLICT_CODES];

// ── Conflict resolution strategies ────────────────────────────────────────────

export const CONFLICT_RESOLUTION_STRATEGIES = {
  KEEP_SERVER: "KEEP_SERVER",
  KEEP_LOCAL: "KEEP_LOCAL",
  MANUAL_MERGE: "MANUAL_MERGE",
} as const;

export type ConflictResolutionStrategy =
  (typeof CONFLICT_RESOLUTION_STRATEGIES)[keyof typeof CONFLICT_RESOLUTION_STRATEGIES];

