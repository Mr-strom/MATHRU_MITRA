/**
 * MaatruMitra — Sync actions repository.
 * Tracks client offline sync requests and preserves exact-once idempotency.
 */

import { getDb } from "../db/client.js";
import { nanoid } from "nanoid";

export interface SyncActionRow {
  id: string;
  idempotency_key: string;
  actor_user_id: string;
  action_id: string;
  entity_type: "VOICE_NOTE" | "TRANSCRIPT_REVISION" | "FOLLOW_UP_DRAFT" | "TASK";
  entity_id: string;
  action_type: string;
  result: "APPLIED" | "ALREADY_APPLIED" | "CONFLICT" | "REJECTED";
  authoritative_entity_json: string | null;
  audit_event_id: string | null;
  conflict_code: string | null;
  created_at: string;
}

export interface SyncActionInsert {
  idempotency_key: string;
  actor_user_id: string;
  action_id: string;
  entity_type: "VOICE_NOTE" | "TRANSCRIPT_REVISION" | "FOLLOW_UP_DRAFT" | "TASK";
  entity_id: string;
  action_type: string;
  result: "APPLIED" | "ALREADY_APPLIED" | "CONFLICT" | "REJECTED";
  authoritative_entity_json?: string | null;
  audit_event_id?: string | null;
  conflict_code?: string | null;
}

export function findByIdempotencyKey(key: string): SyncActionRow | null {
  const row = getDb()
    .prepare("SELECT * FROM sync_actions WHERE idempotency_key = ?")
    .get(key) as SyncActionRow | undefined;
  return row ?? null;
}

export function create(data: SyncActionInsert): SyncActionRow {
  const id = nanoid();
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_actions (
      id, idempotency_key, actor_user_id, action_id, entity_type,
      entity_id, action_type, result, authoritative_entity_json,
      audit_event_id, conflict_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.idempotency_key,
    data.actor_user_id,
    data.action_id,
    data.entity_type,
    data.entity_id,
    data.action_type,
    data.result,
    data.authoritative_entity_json ?? null,
    data.audit_event_id ?? null,
    data.conflict_code ?? null
  );

  return findByIdempotencyKey(data.idempotency_key)!;
}
