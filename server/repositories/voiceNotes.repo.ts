/**
 * MaatruMitra — Voice notes repository.
 */

import { getDb } from "./base.js";
import { nanoid } from "nanoid";
import type { VoiceNoteState } from "@shared/states.js";

export interface VoiceNoteRow {
  id: string;
  beneficiary_reference_id: string;
  created_by_user_id: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  duration_seconds: number | null;
  language_declared: string;
  consent_snapshot: string | null;
  status: VoiceNoteState;
  created_at: string;
  updated_at: string;
}

export interface CreateVoiceNoteInput {
  beneficiary_reference_id: string;
  created_by_user_id: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  duration_seconds?: number;
  language_declared?: string;
  consent_snapshot?: string;
}

export function create(input: CreateVoiceNoteInput): VoiceNoteRow {
  const id = nanoid();
  const now = new Date().toISOString();
  const lang = input.language_declared ?? "kn";
  const duration = input.duration_seconds ?? null;
  const consent = input.consent_snapshot ?? null;
  getDb().prepare(`
    INSERT INTO voice_notes
      (id, beneficiary_reference_id, created_by_user_id, storage_key,
       mime_type, byte_size, duration_seconds, language_declared,
       consent_snapshot, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
  `).run(id, input.beneficiary_reference_id, input.created_by_user_id, input.storage_key,
    input.mime_type, input.byte_size, duration, lang, consent, now, now);
  return findById(id)!;
}

export function findById(id: string): VoiceNoteRow | undefined {
  return getDb()
    .prepare("SELECT * FROM voice_notes WHERE id = ?")
    .get(id) as VoiceNoteRow | undefined;
}

export function findByCreator(userId: string): VoiceNoteRow[] {
  return getDb()
    .prepare("SELECT * FROM voice_notes WHERE created_by_user_id = ? ORDER BY created_at DESC")
    .all(userId) as VoiceNoteRow[];
}

export function updateStatus(id: string, status: VoiceNoteState): void {
  getDb().prepare(
    "UPDATE voice_notes SET status = ?, updated_at = ? WHERE id = ?"
  ).run(status, new Date().toISOString(), id);
}

export function findByBeneficiary(beneficiaryRefId: string): VoiceNoteRow[] {
  return getDb()
    .prepare("SELECT * FROM voice_notes WHERE beneficiary_reference_id = ? ORDER BY created_at DESC")
    .all(beneficiaryRefId) as VoiceNoteRow[];
}
