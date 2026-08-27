-- MaatruMitra — Optimistic Concurrency & Entity Versioning
-- Version: 004
-- Adds monotonic server_version tracking to syncable administrative entities.

PRAGMA foreign_keys = ON;

-- 1. Voice notes monotonic version
ALTER TABLE voice_notes ADD COLUMN server_version INTEGER NOT NULL DEFAULT 1;

-- 2. Follow-up drafts monotonic version
ALTER TABLE follow_up_drafts ADD COLUMN server_version INTEGER NOT NULL DEFAULT 1;

-- 3. Follow-up tasks monotonic version
ALTER TABLE follow_up_tasks ADD COLUMN server_version INTEGER NOT NULL DEFAULT 1;

-- Indexes for version lookups
CREATE INDEX IF NOT EXISTS idx_vn_version ON voice_notes(id, server_version);
CREATE INDEX IF NOT EXISTS idx_draft_version ON follow_up_drafts(id, server_version);
CREATE INDEX IF NOT EXISTS idx_task_version ON follow_up_tasks(id, server_version);
