/**
 * MaatruMitra — Shared Zod schemas.
 *
 * Used for:
 *   - Server-side request validation (imported by middleware)
 *   - Client-side API response typing (imported by lib/api.ts)
 *
 * Safety rule: AdministrativeFollowUpDraft must not contain clinical fields.
 * Any clinical terminology in extraction output must be rejected at the
 * extraction service layer before reaching this schema.
 */

import { z } from "zod";
import { FOLLOW_UP_CATEGORIES, DRAFT_STATES, TASK_STATES } from "./states.js";
import { ROLES } from "./roles.js";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  role: z.enum([ROLES.ASHA_WORKER, ROLES.ANM_REVIEWER, ROLES.PHC_ADMIN, ROLES.SYSTEM]),
  assigned_area_id: z.string().nullable(),
  status: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

// ── Areas ─────────────────────────────────────────────────────────────────────

export const AreaSchema = z.object({
  id: z.string(),
  district: z.string(),
  taluk: z.string(),
  phc_name: z.string(),
  ward_village_label: z.string(),
  active: z.boolean(),
});
export type Area = z.infer<typeof AreaSchema>;

// ── Beneficiary references ────────────────────────────────────────────────────

export const BeneficiaryRefSchema = z.object({
  id: z.string(),
  external_reference_alias: z.string(),
  area_id: z.string(),
  consent_status: z.enum(["PENDING", "GIVEN", "WITHDRAWN"]),
  consent_captured_at: z.string().nullable(),
  data_retention_until: z.string().nullable(),
  created_at: z.string(),
});
export type BeneficiaryRef = z.infer<typeof BeneficiaryRefSchema>;

// ── Voice notes ───────────────────────────────────────────────────────────────

export const CreateVoiceNoteSchema = z.object({
  beneficiary_reference_id: z.string(),
  language_declared: z.string().default("kn"),
  /** Consent must be explicitly provided before recording is accepted. */
  consent_given: z.literal(true, {
    message: "Consent must be explicitly provided before a voice note can be recorded.",
  }),
  mime_type: z.string(),
  byte_size: z.number().int().positive(),
  duration_seconds: z.number().positive().optional(),
  consent_snapshot: z.string().optional(),
});
export type CreateVoiceNoteRequest = z.infer<typeof CreateVoiceNoteSchema>;

export const VoiceNoteSchema = z.object({
  id: z.string(),
  beneficiary_reference_id: z.string(),
  created_by_user_id: z.string(),
  storage_key: z.string(),
  mime_type: z.string(),
  byte_size: z.number(),
  duration_seconds: z.number().nullable(),
  language_declared: z.string(),
  status: z.string(),
  server_version: z.number().default(1),
  created_at: z.string(),
});
export type VoiceNote = z.infer<typeof VoiceNoteSchema>;

// ── Transcripts ───────────────────────────────────────────────────────────────

export const TranscriptSourceSchema = z.enum(["PROVIDER", "WORKER_EDITED"]);
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;

export const AddTranscriptRevisionSchema = z.object({
  text: z.string().min(1).max(10000),
  language: z.string().default("kn"),
});
export type AddTranscriptRevisionRequest = z.infer<typeof AddTranscriptRevisionSchema>;

export const TranscriptSchema = z.object({
  id: z.string(),
  voice_note_id: z.string(),
  source: TranscriptSourceSchema,
  language: z.string(),
  text: z.string(),
  confidence_summary: z.string().nullable(),
  provider_name: z.string().nullable(),
  provider_version: z.string().nullable(),
  created_at: z.string(),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

// ── Administrative follow-up draft (extraction schema) ────────────────────────

/**
 * SAFETY: This schema governs what may appear in an extracted follow-up draft.
 * Clinical fields (diagnoses, risk levels, medications, dosages, thresholds,
 * treatment instructions) are intentionally absent.
 * The extraction service must reject any provider output that falls outside
 * this schema or that contains clinical terminology in free-text fields.
 */
export const AdministrativeFollowUpDraftSchema = z.object({
  beneficiary_reference_alias: z.string().nullable(),
  area_reference: z.string().nullable(),
  observed_timing_text: z.string().nullable(),
  worker_observation_summary: z.string().max(2000),
  follow_up_category: z.enum([
    FOLLOW_UP_CATEGORIES.MISSED_CONTACT,
    FOLLOW_UP_CATEGORIES.ROUTINE_HOME_VISIT,
    FOLLOW_UP_CATEGORIES.SERVICE_VISIT_REMINDER,
    FOLLOW_UP_CATEGORIES.SUPPLEMENT_ROUTINE_NOTE,
    FOLLOW_UP_CATEGORIES.REVIEW_REQUIRED,
    FOLLOW_UP_CATEGORIES.OTHER_ADMINISTRATIVE,
  ]),
  proposed_owner_role: z
    .enum([ROLES.ANM_REVIEWER, ROLES.ASHA_WORKER, ROLES.PHC_ADMIN])
    .nullable(),
  proposed_due_at: z.string().nullable(),
  source_evidence: z.array(
    z.object({
      transcript_quote: z.string().max(500),
      transcript_start: z.number().optional(),
      transcript_end: z.number().optional(),
    })
  ),
  /** Always true — reminds consumers that a human must review before action. */
  required_human_review: z.literal(true),
  uncertainty_note: z.string().max(500).nullable(),
});
export type AdministrativeFollowUpDraft = z.infer<typeof AdministrativeFollowUpDraftSchema>;

// ── Follow-up draft API schemas ───────────────────────────────────────────────

export const CreateDraftFromTranscriptSchema = z.object({
  transcript_id: z.string(),
});

export const SubmitReviewSchema = z.object({
  /** Optional worker note explaining the review decision. */
  worker_note: z.string().max(1000).optional(),
});

export const ANMConfirmSchema = z.object({
  owner_user_id: z.string(),
  due_at: z.string(),
  reviewer_note: z.string().max(1000).optional(),
});

export const ANMReviseSchema = z.object({
  owner_user_id: z.string().optional(),
  due_at: z.string().optional(),
  reviewer_note: z.string().min(1).max(1000),
  revised_summary: z.string().max(2000).optional(),
});

export const ANMDismissSchema = z.object({
  reason: z.string().min(1).max(1000),
});

// ── Follow-up draft response ──────────────────────────────────────────────────

export const FollowUpDraftSchema = z.object({
  id: z.string(),
  voice_note_id: z.string(),
  transcript_id: z.string(),
  state: z.enum([
    DRAFT_STATES.VOICE_NOTE_DRAFT,
    DRAFT_STATES.TRANSCRIPT_READY,
    DRAFT_STATES.WORKER_REVIEWED,
    DRAFT_STATES.AWAITING_ANM_REVIEW,
    DRAFT_STATES.CONFIRMED,
    DRAFT_STATES.REVISED,
    DRAFT_STATES.DISMISSED,
  ]),
  administrative_category: z.string().nullable(),
  summary: z.string().nullable(),
  proposed_owner_user_id: z.string().nullable(),
  proposed_due_at: z.string().nullable(),
  extraction_confidence: z.string().nullable(),
  citation_id: z.string().nullable(),
  server_version: z.number().default(1),
  created_at: z.string(),
  updated_at: z.string(),
});
export type FollowUpDraft = z.infer<typeof FollowUpDraftSchema>;

// ── Task schemas ──────────────────────────────────────────────────────────────

export const TaskCompleteSchema = z.object({
  completion_note: z.string().max(1000).optional(),
});

export const TaskSchema = z.object({
  id: z.string(),
  draft_id: z.string(),
  status: z.enum([
    TASK_STATES.TASK_OPEN,
    TASK_STATES.TASK_ACKNOWLEDGED,
    TASK_STATES.TASK_COMPLETED,
    TASK_STATES.TASK_CANCELLED,
  ]),
  owner_user_id: z.string(),
  due_at: z.string(),
  reviewer_user_id: z.string(),
  reviewer_note: z.string().nullable(),
  confirmed_at: z.string(),
  completed_at: z.string().nullable(),
  server_version: z.number().default(1),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

// ── SOP / guidance schemas ────────────────────────────────────────────────────

export const SopExcerptSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  section_label: z.string(),
  page_reference: z.string(),
  excerpt_text: z.string(),
  tags: z.array(z.string()),
  document: z.object({
    title: z.string(),
    version: z.string(),
    effective_date: z.string(),
    approval_status: z.string(),
  }),
});
export type SopExcerpt = z.infer<typeof SopExcerptSchema>;

// ── Audit event schema ────────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  id: z.string(),
  actor_user_id: z.string().nullable(),
  entity_type: z.string(),
  entity_id: z.string(),
  event_type: z.string(),
  previous_state: z.string().nullable(),
  next_state: z.string().nullable(),
  safe_payload_json: z.string().nullable(),
  created_at: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ── Pagination ────────────────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    next_cursor: z.string().nullable(),
    total_count: z.number().optional(),
  });

// ── Standard API error ────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ── Offline sync action contracts ─────────────────────────────────────────────

export const SyncActionRequestSchema = z.object({
  action_id: z.string(),
  idempotency_key: z.string(),
  entity_type: z.enum(["VOICE_NOTE", "TRANSCRIPT_REVISION", "FOLLOW_UP_DRAFT", "TASK"]),
  entity_id: z.string(),
  action_type: z.string(),
  base_server_version: z.number().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
export type SyncActionRequest = z.infer<typeof SyncActionRequestSchema>;

export const SyncActionResponseSchema = z.object({
  action_id: z.string(),
  result: z.enum(["APPLIED", "ALREADY_APPLIED", "CONFLICT", "REJECTED"]),
  authoritative_entity: z.record(z.string(), z.unknown()).nullable(),
  audit_event_id: z.string().nullable(),
  conflict_code: z.string().nullable(),
});
export type SyncActionResponse = z.infer<typeof SyncActionResponseSchema>;

// ── Conflict resolution contracts ─────────────────────────────────────────────

export const ConflictResolutionRequestSchema = z.object({
  entity_type: z.enum(["VOICE_NOTE", "FOLLOW_UP_DRAFT", "TASK"]),
  entity_id: z.string(),
  base_server_version: z.number(),
  resolution_strategy: z.enum(["KEEP_SERVER", "KEEP_LOCAL", "MANUAL_MERGE"]),
  resolved_fields: z.record(z.string(), z.unknown()).optional(),
  resolution_reason: z.string().min(1).max(1000),
  local_snapshot: z.record(z.string(), z.unknown()),
});
export type ConflictResolutionRequest = z.infer<typeof ConflictResolutionRequestSchema>;

export const ConflictResolutionResponseSchema = z.object({
  success: z.boolean(),
  entity_type: z.string(),
  entity_id: z.string(),
  new_server_version: z.number(),
  authoritative_entity: z.record(z.string(), z.unknown()),
  audit_event_id: z.string(),
});
export type ConflictResolutionResponse = z.infer<typeof ConflictResolutionResponseSchema>;

// ── Operational supervisor reporting contracts ────────────────────────────────

export const AreaBreakdownItemSchema = z.object({
  area_id: z.string(),
  district: z.string(),
  taluk: z.string(),
  phc_name: z.string(),
  ward_village_label: z.string(),
  drafts_count: z.number(),
  tasks_count: z.number(),
  active_workers_count: z.number(),
});
export type AreaBreakdownItem = z.infer<typeof AreaBreakdownItemSchema>;

export const RoleActivityItemSchema = z.object({
  role: z.string(),
  actions_count: z.number(),
});
export type RoleActivityItem = z.infer<typeof RoleActivityItemSchema>;

export const TasksSummarySchema = z.object({
  open: z.number(),
  acknowledged: z.number(),
  completed: z.number(),
  overdue: z.number(),
  total: z.number(),
});
export type TasksSummary = z.infer<typeof TasksSummarySchema>;

export const SyncReliabilitySummarySchema = z.object({
  total_synced_actions: z.number(),
  applied: z.number(),
  conflicts: z.number(),
  failures: z.number(),
  resolved_conflicts: z.number(),
});
export type SyncReliabilitySummary = z.infer<typeof SyncReliabilitySummarySchema>;

export const OperationalReportResponseSchema = z.object({
  drafts_awaiting_review: z.number(),
  tasks_summary: TasksSummarySchema,
  sync_reliability: SyncReliabilitySummarySchema,
  median_turnaround_minutes: z.number().nullable(),
  area_breakdown: z.array(AreaBreakdownItemSchema),
  role_activity: z.array(RoleActivityItemSchema),
  generated_at: z.string(),
  safety_notice: z.string(),
});
export type OperationalReportResponse = z.infer<typeof OperationalReportResponseSchema>;


