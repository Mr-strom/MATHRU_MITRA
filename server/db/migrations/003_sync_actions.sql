-- MaatruMitra — Sync Actions & Idempotency
-- Version: 003
-- Tracks sync actions applied from offline queues to ensure exact-once idempotency.
-- Stores administrative sync audit metadata only.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sync_actions (
  id                       TEXT PRIMARY KEY,
  idempotency_key          TEXT NOT NULL UNIQUE,
  actor_user_id            TEXT NOT NULL REFERENCES users(id),
  action_id                TEXT NOT NULL,
  entity_type              TEXT NOT NULL CHECK(entity_type IN ('VOICE_NOTE', 'TRANSCRIPT_REVISION', 'FOLLOW_UP_DRAFT', 'TASK')),
  entity_id                TEXT NOT NULL,
  action_type              TEXT NOT NULL,
  result                   TEXT NOT NULL CHECK(result IN ('APPLIED', 'ALREADY_APPLIED', 'CONFLICT', 'REJECTED')),
  authoritative_entity_json TEXT,
  audit_event_id           TEXT REFERENCES audit_events(id),
  conflict_code            TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_idempotency ON sync_actions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sync_actor ON sync_actions(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_actions(entity_type, entity_id);
