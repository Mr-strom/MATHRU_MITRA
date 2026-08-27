/**
 * MaatruMitra — Follow-up drafts repository.
 */

import { getDb } from "./base.js";
import { nanoid } from "nanoid";
import type { DraftState } from "@shared/states.js";

export interface FollowUpDraftRow {
  id: string;
  voice_note_id: string;
  transcript_id: string;
  state: DraftState;
  administrative_category: string | null;
  summary: string | null;
  proposed_owner_user_id: string | null;
  proposed_due_at: string | null;
  extraction_confidence: string | null;
  extraction_raw_json: string | null;
  citation_id: string | null;
  server_version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDraftInput {
  voice_note_id: string;
  transcript_id: string;
  administrative_category?: string;
  summary?: string;
  proposed_owner_user_id?: string;
  proposed_due_at?: string;
  extraction_confidence?: string;
  extraction_raw_json?: string;
  citation_id?: string;
}

export function create(input: CreateDraftInput): FollowUpDraftRow {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO follow_up_drafts
      (id, voice_note_id, transcript_id, state, administrative_category,
       summary, proposed_owner_user_id, proposed_due_at, extraction_confidence,
       extraction_raw_json, citation_id, server_version, created_at, updated_at)
    VALUES (?, ?, ?, 'TRANSCRIPT_READY', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, input.voice_note_id, input.transcript_id,
    input.administrative_category ?? null,
    input.summary ?? null,
    input.proposed_owner_user_id ?? null,
    input.proposed_due_at ?? null,
    input.extraction_confidence ?? null,
    input.extraction_raw_json ?? null,
    input.citation_id ?? null,
    now, now
  );
  return findById(id)!;
}

export function findById(id: string): FollowUpDraftRow | undefined {
  return getDb()
    .prepare("SELECT * FROM follow_up_drafts WHERE id = ?")
    .get(id) as FollowUpDraftRow | undefined;
}

export function updateState(
  id: string,
  state: DraftState,
  extra?: Partial<Pick<FollowUpDraftRow, "proposed_owner_user_id" | "proposed_due_at" | "citation_id" | "summary">>
): void {
  const now = new Date().toISOString();
  if (extra && Object.keys(extra).length > 0) {
    // Build SET clause for allowed columns only
    const allowed = ["proposed_owner_user_id", "proposed_due_at", "citation_id", "summary"] as const;
    const sets = allowed.filter((k) => k in extra).map((k) => `${k} = ?`).join(", ");
    const values = allowed.filter((k) => k in extra).map((k) => extra[k] ?? null);
    getDb().prepare(
      `UPDATE follow_up_drafts SET state = ?, server_version = server_version + 1, updated_at = ?, ${sets} WHERE id = ?`
    ).run(state, now, ...values, id);
  } else {
    getDb().prepare(
      "UPDATE follow_up_drafts SET state = ?, server_version = server_version + 1, updated_at = ? WHERE id = ?"
    ).run(state, now, id);
  }
}

export function updateFields(
  id: string,
  fields: Partial<Pick<FollowUpDraftRow, "summary" | "proposed_owner_user_id" | "proposed_due_at" | "citation_id" | "administrative_category">>
): void {
  const now = new Date().toISOString();
  const allowed = ["summary", "proposed_owner_user_id", "proposed_due_at", "citation_id", "administrative_category"] as const;
  const sets = allowed.filter((k) => k in fields).map((k) => `${k} = ?`).join(", ");
  const values = allowed.filter((k) => k in fields).map((k) => fields[k] ?? null);
  if (sets.length > 0) {
    getDb().prepare(
      `UPDATE follow_up_drafts SET server_version = server_version + 1, updated_at = ?, ${sets} WHERE id = ?`
    ).run(now, ...values, id);
  }
}

/** Queue for ANM review: drafts in AWAITING_ANM_REVIEW state for a given area. */
export function findAwaitingReview(areaId?: string, cursor?: string, limit = 20): FollowUpDraftRow[] {
  if (areaId) {
    return getDb().prepare(`
      SELECT fd.* FROM follow_up_drafts fd
      JOIN voice_notes vn ON vn.id = fd.voice_note_id
      JOIN beneficiary_references br ON br.id = vn.beneficiary_reference_id
      WHERE fd.state = 'AWAITING_ANM_REVIEW'
        AND br.area_id = ?
        ${cursor ? "AND fd.created_at < ?" : ""}
      ORDER BY fd.created_at ASC
      LIMIT ?
    `).all(...[areaId, ...(cursor ? [cursor] : []), limit]) as FollowUpDraftRow[];
  }
  return getDb().prepare(`
    SELECT * FROM follow_up_drafts
    WHERE state = 'AWAITING_ANM_REVIEW'
      ${cursor ? "AND created_at < ?" : ""}
    ORDER BY created_at ASC LIMIT ?
  `).all(...(cursor ? [cursor, limit] : [limit])) as FollowUpDraftRow[];
}

export function findByVoiceNote(voiceNoteId: string): FollowUpDraftRow[] {
  return getDb()
    .prepare("SELECT * FROM follow_up_drafts WHERE voice_note_id = ? ORDER BY created_at DESC")
    .all(voiceNoteId) as FollowUpDraftRow[];
}

export function findByCreator(userId: string, cursor?: string, limit = 20): FollowUpDraftRow[] {
  return getDb().prepare(`
    SELECT fd.* FROM follow_up_drafts fd
    JOIN voice_notes vn ON vn.id = fd.voice_note_id
    WHERE vn.created_by_user_id = ?
      ${cursor ? "AND fd.created_at < ?" : ""}
    ORDER BY fd.created_at DESC LIMIT ?
  `).all(...[userId, ...(cursor ? [cursor] : []), limit]) as FollowUpDraftRow[];
}
