/**
 * MaatruMitra — Transcripts repository.
 * Revision history is immutable — original provider transcripts are never overwritten.
 * Each worker edit creates a new row.
 */

import { getDb } from "./base.js";
import { nanoid } from "nanoid";
import type { TranscriptSource } from "@shared/schemas.js";

export interface TranscriptRow {
  id: string;
  voice_note_id: string;
  source: TranscriptSource;
  language: string;
  text: string;
  confidence_summary: string | null;
  provider_name: string | null;
  provider_version: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface CreateTranscriptInput {
  voice_note_id: string;
  source: TranscriptSource;
  language?: string;
  text: string;
  confidence_summary?: string;
  provider_name?: string;
  provider_version?: string;
  created_by_user_id?: string;
}

export function create(input: CreateTranscriptInput): TranscriptRow {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO transcripts
      (id, voice_note_id, source, language, text, confidence_summary,
       provider_name, provider_version, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.voice_note_id, input.source, input.language ?? "kn", input.text,
    input.confidence_summary ?? null, input.provider_name ?? null,
    input.provider_version ?? null, input.created_by_user_id ?? null, now
  );
  return findById(id)!;
}

export function findById(id: string): TranscriptRow | undefined {
  return getDb()
    .prepare("SELECT * FROM transcripts WHERE id = ?")
    .get(id) as TranscriptRow | undefined;
}

/** Returns all revisions for a voice note, newest first. */
export function findByVoiceNote(voiceNoteId: string): TranscriptRow[] {
  return getDb()
    .prepare("SELECT * FROM transcripts WHERE voice_note_id = ? ORDER BY created_at DESC")
    .all(voiceNoteId) as TranscriptRow[];
}

/** Returns the most recent transcript for a voice note. */
export function findLatest(voiceNoteId: string): TranscriptRow | undefined {
  return getDb()
    .prepare("SELECT * FROM transcripts WHERE voice_note_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(voiceNoteId) as TranscriptRow | undefined;
}
