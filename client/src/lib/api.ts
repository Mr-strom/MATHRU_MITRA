/**
 * MaatruMitra — Typed API client.
 *
 * Thin fetch wrapper that:
 * - Sends credentials (cookies) on every request
 * - Handles 401 by clearing local auth state
 * - Provides typed request/response helpers per resource
 *
 * All requests go to /api/v1 — the Vite dev server proxies to Express.
 */

const BASE = "/api/v1";

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
  note?: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError
  ) {
    super(body.error);
    this.name = "ApiRequestError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({
      error: "Request failed",
      code: "UNKNOWN",
    }))) as ApiError;

    if (res.status === 401) {
      // Let auth hook handle redirect
      window.dispatchEvent(new Event("maatrumitra:unauthorized"));
    }

    throw new ApiRequestError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  login: (username: string, password: string) =>
    request<{ user: AuthUser }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<AuthUser>("GET", "/me"),
  refresh: () => request<{ user: AuthUser }>("POST", "/auth/refresh"),
};

export interface AuthUser {
  id: string;
  display_name: string;
  role: "ASHA_WORKER" | "ANM_REVIEWER" | "PHC_ADMIN";
  assigned_area_id: string | null;
  status?: string;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = {
  getAssignableAshas: () =>
    request<{ items: AuthUser[] }>("GET", "/users/assignable-ashas"),
};

// ── Beneficiary references ────────────────────────────────────────────────────
export const beneficiaryRefs = {
  getDemo: () =>
    request<BeneficiaryRefRecord>("GET", "/beneficiary-refs/demo"),
};

export interface BeneficiaryRefRecord {
  id: string;
  external_reference_alias: string;
  area_id: string;
  consent_status: string;
  fixture: boolean;
  notice: string;
}

// ── Voice notes ───────────────────────────────────────────────────────────────
export const voiceNotes = {
  createIntent: (payload: {
    beneficiary_reference_id: string;
    mime_type: string;
    byte_size: number;
    duration_seconds?: number;
    consent_given: true;
    language_declared?: string;
  }) => request<{ voice_note: VoiceNoteRecord; upload_url: string }>("POST", "/voice-notes", payload),

  uploadAudio: async (uploadUrl: string, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "synthetic_voice_note.webm");
    const res = await fetch(uploadUrl, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Audio upload failed", code: "UPLOAD_FAILED" }));
      throw new ApiRequestError(res.status, err);
    }
    return res.json() as Promise<{ message: string; key: string }>;
  },

  submit: (id: string) => request<{ message: string }>("POST", `/voice-notes/${id}/submit`),

  get: (id: string) => request<VoiceNoteRecord>("GET", `/voice-notes/${id}`),

  getTranscripts: (id: string) =>
    request<{ transcripts: TranscriptRecord[] }>("GET", `/voice-notes/${id}/transcripts`),

  addTranscriptRevision: (id: string, text: string, language = "kn") =>
    request<{ transcript: TranscriptRecord }>("POST", `/voice-notes/${id}/transcripts`, {
      text,
      language,
    }),
};

export interface VoiceNoteRecord {
  id: string;
  status: string;
  mime_type: string;
  byte_size: number;
  language_declared: string;
  created_at: string;
}

export interface TranscriptRecord {
  id: string;
  source: "PROVIDER" | "WORKER_EDITED";
  language: string;
  text: string;
  confidence_summary: string | null;
  provider_name: string | null;
  created_at: string;
}

// ── Follow-up drafts ──────────────────────────────────────────────────────────
export const drafts = {
  createFromTranscript: (transcriptId: string) =>
    request<{ draft: DraftRecord; notice: string }>("POST", "/follow-up-drafts/from-transcript", {
      transcript_id: transcriptId,
    }),

  markReviewed: (id: string) =>
    request<{ draft: DraftRecord }>("POST", `/follow-up-drafts/${id}/mark-reviewed`),

  list: (cursor?: string) =>
    request<{ items: DraftRecord[]; next_cursor: string | null }>(
      "GET",
      `/follow-up-drafts${cursor ? `?cursor=${cursor}` : ""}`
    ),

  get: (id: string) =>
    request<{ draft: DraftRecord; audit_history: AuditEvent[]; citation: SopExcerpt | null }>(
      "GET",
      `/follow-up-drafts/${id}`
    ),

  submitForReview: (id: string, workerNote?: string) =>
    request<{ draft: DraftRecord }>("POST", `/follow-up-drafts/${id}/submit-review`, {
      worker_note: workerNote,
    }),

  confirm: (id: string, ownerUserId: string, dueAt: string, reviewerNote?: string) =>
    request<{ draft: DraftRecord; task: TaskRecord; notice: string }>(
      "POST",
      `/follow-up-drafts/${id}/confirm`,
      { owner_user_id: ownerUserId, due_at: dueAt, reviewer_note: reviewerNote }
    ),

  revise: (id: string, payload: { owner_user_id?: string; due_at?: string; reviewer_note: string; revised_summary?: string }) =>
    request<{ draft: DraftRecord }>("POST", `/follow-up-drafts/${id}/revise`, payload),

  dismiss: (id: string, reason: string) =>
    request<{ draft: DraftRecord }>("POST", `/follow-up-drafts/${id}/dismiss`, { reason }),
};

export interface DraftRecord {
  id: string;
  voice_note_id: string;
  transcript_id: string;
  state: string;
  administrative_category: string | null;
  summary: string | null;
  proposed_owner_user_id: string | null;
  proposed_due_at: string | null;
  citation_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const tasks = {
  list: (cursor?: string, status?: string) =>
    request<{ items: TaskRecord[]; next_cursor: string | null }>(
      "GET",
      `/tasks${cursor || status ? `?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(status ? { status } : {}) })}` : ""}`
    ),

  get: (id: string) => request<TaskRecord>("GET", `/tasks/${id}`),
  acknowledge: (id: string) => request<{ task: TaskRecord; notice: string }>("POST", `/tasks/${id}/acknowledge`),
  complete: (id: string, completionNote?: string) =>
    request<{ task: TaskRecord; notice: string }>("POST", `/tasks/${id}/complete`, {
      completion_note: completionNote,
    }),
};

export interface TaskRecord {
  id: string;
  draft_id: string;
  status: string;
  owner_user_id: string;
  due_at: string;
  reviewer_user_id: string;
  reviewer_note: string | null;
  confirmed_at: string;
  completed_at: string | null;
  created_at: string;
}

// ── SOP search ────────────────────────────────────────────────────────────────
export const sop = {
  search: (q: string, limit = 5) =>
    request<{ excerpts: SopExcerpt[]; total: number }>(
      "GET",
      `/sop-excerpts/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
};

export interface SopExcerpt {
  id: string;
  section_label: string;
  page_reference: string;
  excerpt_text: string;
  tags: string[];
  document: { title: string; version: string; effective_date: string };
  citation_note: string;
}

// ── Audit events ──────────────────────────────────────────────────────
export interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  event_type: string;
  previous_state: string | null;
  next_state: string | null;
  safe_payload_json?: string | null;
  created_at: string;
}

// Health check
export const health = {
  check: () => request<{ status: string; prototype: boolean }>("GET", "/health"),
};
