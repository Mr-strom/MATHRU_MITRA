/**
 * MaatruMitra — Audit events repository.
 * Rows are insert-only. Never updated or deleted.
 */

import { getDb } from "./base.js";
import { nanoid } from "nanoid";

export interface AuditEventRow {
  id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  event_type: string;
  previous_state: string | null;
  next_state: string | null;
  safe_payload_json: string | null;
  created_at: string;
}

export interface CreateAuditEventInput {
  actor_user_id?: string | null;
  entity_type: string;
  entity_id: string;
  event_type: string;
  previous_state?: string | null;
  next_state?: string | null;
  /** Must not contain raw transcript text, access tokens, audio URLs, or real identifiers. */
  safe_payload?: Record<string, unknown>;
}

export function emit(input: CreateAuditEventInput): AuditEventRow {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO audit_events
      (id, actor_user_id, entity_type, entity_id, event_type,
       previous_state, next_state, safe_payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.actor_user_id ?? null,
    input.entity_type,
    input.entity_id,
    input.event_type,
    input.previous_state ?? null,
    input.next_state ?? null,
    input.safe_payload ? JSON.stringify(input.safe_payload) : null,
    now
  );
  return findById(id)!;
}

export function findById(id: string): AuditEventRow | undefined {
  return getDb()
    .prepare("SELECT * FROM audit_events WHERE id = ?")
    .get(id) as AuditEventRow | undefined;
}

export function findByEntity(
  entityType: string,
  entityId: string,
  limit = 50
): AuditEventRow[] {
  return getDb()
    .prepare(`
      SELECT * FROM audit_events
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(entityType, entityId, limit) as AuditEventRow[];
}

export function findRecent(
  cursor?: string,
  limit = 50
): AuditEventRow[] {
  if (cursor) {
    return getDb()
      .prepare("SELECT * FROM audit_events WHERE created_at < ? ORDER BY created_at DESC LIMIT ?")
      .all(cursor, limit) as AuditEventRow[];
  }
  return getDb()
    .prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?")
    .all(limit) as AuditEventRow[];
}
