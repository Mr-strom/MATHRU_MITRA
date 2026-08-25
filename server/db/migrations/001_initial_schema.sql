-- MaatruMitra — Initial Schema Migration
-- Version: 001
-- All IDs are nanoid strings (21 chars). All timestamps are ISO-8601 UTC strings.
-- This database stores administrative coordination data only.
-- No clinical diagnoses, prescriptions, or risk scores are stored.

PRAGMA foreign_keys = ON;

-- ── Areas ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS areas (
  id                TEXT PRIMARY KEY,
  district          TEXT NOT NULL,
  taluk             TEXT NOT NULL,
  phc_name          TEXT NOT NULL,
  ward_village_label TEXT NOT NULL,
  active            INTEGER NOT NULL DEFAULT 1, -- 1=true, 0=false
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  username          TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  role              TEXT NOT NULL CHECK(role IN ('ASHA_WORKER','ANM_REVIEWER','PHC_ADMIN','SYSTEM')),
  assigned_area_id  TEXT REFERENCES areas(id),
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','DEACTIVATED')),
  password_hash     TEXT,          -- null if using external auth
  external_auth_id  TEXT,          -- null if using local password
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_area ON users(assigned_area_id);

-- ── Beneficiary references ────────────────────────────────────────────────────
-- Stores a pseudonymous alias, not real names. Real names must never be the
-- primary key or stored without explicit consent and governance approval.
CREATE TABLE IF NOT EXISTS beneficiary_references (
  id                       TEXT PRIMARY KEY,
  external_reference_alias TEXT NOT NULL UNIQUE, -- e.g. "BEN-CHITRADURGA-0042"
  area_id                  TEXT NOT NULL REFERENCES areas(id),
  consent_status           TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK(consent_status IN ('PENDING','GIVEN','WITHDRAWN')),
  consent_captured_at      TEXT,
  data_retention_until     TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ben_area ON beneficiary_references(area_id);
CREATE INDEX IF NOT EXISTS idx_ben_consent ON beneficiary_references(consent_status);

-- ── Voice notes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_notes (
  id                      TEXT PRIMARY KEY,
  beneficiary_reference_id TEXT NOT NULL REFERENCES beneficiary_references(id),
  created_by_user_id      TEXT NOT NULL REFERENCES users(id),
  storage_key             TEXT NOT NULL UNIQUE, -- non-guessable key for file retrieval
  mime_type               TEXT NOT NULL,
  byte_size               INTEGER NOT NULL,
  duration_seconds        REAL,
  language_declared       TEXT NOT NULL DEFAULT 'kn',
  consent_snapshot        TEXT,  -- serialized consent details at time of recording
  status                  TEXT NOT NULL DEFAULT 'DRAFT'
                            CHECK(status IN ('DRAFT','PROCESSING','TRANSCRIPT_READY','FAILED')),
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vn_beneficiary ON voice_notes(beneficiary_reference_id);
CREATE INDEX IF NOT EXISTS idx_vn_creator ON voice_notes(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_vn_status ON voice_notes(status);

-- ── Transcripts ───────────────────────────────────────────────────────────────
-- Revision history is preserved: original provider transcript is NEVER overwritten.
-- Each worker edit creates a new row with source='WORKER_EDITED'.
CREATE TABLE IF NOT EXISTS transcripts (
  id                  TEXT PRIMARY KEY,
  voice_note_id       TEXT NOT NULL REFERENCES voice_notes(id),
  source              TEXT NOT NULL CHECK(source IN ('PROVIDER','WORKER_EDITED')),
  language            TEXT NOT NULL DEFAULT 'kn',
  text                TEXT NOT NULL,
  confidence_summary  TEXT,  -- e.g. "0.82" or "high/medium/low" — not clinical
  provider_name       TEXT,
  provider_version    TEXT,
  created_by_user_id  TEXT REFERENCES users(id),  -- null for PROVIDER source
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transcript_vn ON transcripts(voice_note_id);
CREATE INDEX IF NOT EXISTS idx_transcript_source ON transcripts(source);

-- ── SOP documents ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sop_documents (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  version             TEXT NOT NULL,
  effective_date      TEXT NOT NULL,
  source_url_or_file_key TEXT,
  checksum            TEXT,
  approval_status     TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK(approval_status IN ('DRAFT','APPROVED','SUPERSEDED','WITHDRAWN')),
  approved_by_user_id TEXT REFERENCES users(id),
  approved_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sop_status ON sop_documents(approval_status);

-- ── SOP excerpts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sop_excerpts (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES sop_documents(id),
  section_label TEXT NOT NULL,
  page_reference TEXT NOT NULL,
  excerpt_text  TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_excerpt_doc ON sop_excerpts(document_id);
CREATE INDEX IF NOT EXISTS idx_excerpt_active ON sop_excerpts(active);

-- ── Follow-up drafts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_drafts (
  id                      TEXT PRIMARY KEY,
  voice_note_id           TEXT NOT NULL REFERENCES voice_notes(id),
  transcript_id           TEXT NOT NULL REFERENCES transcripts(id),
  state                   TEXT NOT NULL DEFAULT 'VOICE_NOTE_DRAFT'
                            CHECK(state IN (
                              'VOICE_NOTE_DRAFT','TRANSCRIPT_READY','WORKER_REVIEWED',
                              'AWAITING_ANM_REVIEW','CONFIRMED','REVISED','DISMISSED'
                            )),
  administrative_category TEXT,  -- FOLLOW_UP_CATEGORIES enum value
  summary                 TEXT,  -- worker_observation_summary from extraction
  proposed_owner_user_id  TEXT REFERENCES users(id),
  proposed_due_at         TEXT,
  extraction_confidence   TEXT,
  extraction_raw_json     TEXT,  -- full extraction output for auditability
  citation_id             TEXT REFERENCES sop_excerpts(id),
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_draft_vn ON follow_up_drafts(voice_note_id);
CREATE INDEX IF NOT EXISTS idx_draft_state ON follow_up_drafts(state);
CREATE INDEX IF NOT EXISTS idx_draft_owner ON follow_up_drafts(proposed_owner_user_id);

-- ── Follow-up tasks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id                TEXT PRIMARY KEY,
  draft_id          TEXT NOT NULL REFERENCES follow_up_drafts(id),
  status            TEXT NOT NULL DEFAULT 'TASK_OPEN'
                      CHECK(status IN (
                        'TASK_OPEN','TASK_ACKNOWLEDGED','TASK_COMPLETED','TASK_CANCELLED'
                      )),
  owner_user_id     TEXT NOT NULL REFERENCES users(id),
  due_at            TEXT NOT NULL,
  reviewer_user_id  TEXT NOT NULL REFERENCES users(id),
  reviewer_note     TEXT,
  confirmed_at      TEXT NOT NULL,
  completed_at      TEXT,
  completion_note   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_draft ON follow_up_tasks(draft_id);
CREATE INDEX IF NOT EXISTS idx_task_status ON follow_up_tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_owner ON follow_up_tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_task_due ON follow_up_tasks(due_at);

-- ── Audit events ──────────────────────────────────────────────────────────────
-- Immutable. Rows are never updated or deleted.
-- safe_payload_json must NOT contain raw transcript text, audio URLs,
-- access tokens, or real identifiers beyond the system-internal entity ID.
CREATE TABLE IF NOT EXISTS audit_events (
  id               TEXT PRIMARY KEY,
  actor_user_id    TEXT REFERENCES users(id),  -- null for SYSTEM actor
  entity_type      TEXT NOT NULL,  -- e.g. 'voice_note', 'follow_up_draft', 'task'
  entity_id        TEXT NOT NULL,
  event_type       TEXT NOT NULL,  -- e.g. 'STATE_TRANSITION', 'TRANSCRIPT_ADDED'
  previous_state   TEXT,
  next_state       TEXT,
  safe_payload_json TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

-- ── Background jobs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS background_jobs (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,   -- 'TRANSCRIPTION' | 'EXTRACTION'
  entity_id        TEXT NOT NULL,   -- voice_note_id or transcript_id
  idempotency_key  TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'QUEUED'
                     CHECK(status IN ('QUEUED','RUNNING','DONE','FAILED')),
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  last_error_safe  TEXT,  -- redacted error message only, no sensitive data
  queued_at        TEXT NOT NULL DEFAULT (datetime('now')),
  started_at       TEXT,
  finished_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_type ON background_jobs(type);
CREATE INDEX IF NOT EXISTS idx_job_entity ON background_jobs(entity_id);

-- ── Notification outbox ───────────────────────────────────────────────────────
-- Status is always DISABLED in this build. No messages are ever sent.
-- This table exists only to make the architecture explicit and auditable.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id                   TEXT PRIMARY KEY,
  task_id              TEXT NOT NULL REFERENCES follow_up_tasks(id),
  channel              TEXT NOT NULL,  -- 'SMS' | 'WHATSAPP' — always disabled
  status               TEXT NOT NULL DEFAULT 'DISABLED'
                          CHECK(status IN ('DISABLED')),
  destination_reference TEXT,  -- never a real phone number in this build
  template_id          TEXT,
  approved_by_user_id  TEXT REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Schema migrations tracking ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
