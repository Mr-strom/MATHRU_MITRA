/**
 * MaatruMitra — Background jobs repository.
 */

import { getDb } from "./base.js";
import { nanoid } from "nanoid";
import type { JobState } from "@shared/states.js";

export interface BackgroundJobRow {
  id: string;
  type: "TRANSCRIPTION" | "EXTRACTION";
  entity_id: string;
  idempotency_key: string;
  status: JobState;
  attempt_count: number;
  last_error_safe: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export function enqueue(
  type: "TRANSCRIPTION" | "EXTRACTION",
  entity_id: string,
  idempotency_key: string
): BackgroundJobRow {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR IGNORE INTO background_jobs
      (id, type, entity_id, idempotency_key, status, attempt_count, queued_at)
    VALUES (?, ?, ?, ?, 'QUEUED', 0, ?)
  `).run(id, type, entity_id, idempotency_key, now);
  return (
    getDb()
      .prepare("SELECT * FROM background_jobs WHERE idempotency_key = ?")
      .get(idempotency_key) as BackgroundJobRow
  );
}

export function findById(id: string): BackgroundJobRow | undefined {
  return getDb()
    .prepare("SELECT * FROM background_jobs WHERE id = ?")
    .get(id) as BackgroundJobRow | undefined;
}

export function claimNext(): BackgroundJobRow | undefined {
  const db = getDb();
  const job = db
    .prepare("SELECT * FROM background_jobs WHERE status = 'QUEUED' ORDER BY queued_at ASC LIMIT 1")
    .get() as BackgroundJobRow | undefined;
  if (!job) return undefined;
  db.prepare(
    "UPDATE background_jobs SET status = 'RUNNING', started_at = ?, attempt_count = attempt_count + 1 WHERE id = ? AND status = 'QUEUED'"
  ).run(new Date().toISOString(), job.id);
  return findById(job.id);
}

export function markDone(id: string): void {
  getDb().prepare(
    "UPDATE background_jobs SET status = 'DONE', finished_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
}

export function markFailed(id: string, safeError: string): void {
  getDb().prepare(
    "UPDATE background_jobs SET status = 'FAILED', finished_at = ?, last_error_safe = ? WHERE id = ?"
  ).run(new Date().toISOString(), safeError, id);
}

export function findByStatus(status: JobState, limit = 20): BackgroundJobRow[] {
  return getDb()
    .prepare("SELECT * FROM background_jobs WHERE status = ? ORDER BY queued_at ASC LIMIT ?")
    .all(status, limit) as BackgroundJobRow[];
}
