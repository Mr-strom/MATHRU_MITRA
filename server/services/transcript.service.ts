/**
 * MaatruMitra — Transcript service.
 *
 * Handles adding worker-edited transcript revisions.
 * The original provider transcript is NEVER mutated — each edit creates a new row.
 */

import * as transcriptsRepo from "../repositories/transcripts.repo.js";
import * as voiceNotesRepo from "../repositories/voiceNotes.repo.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import { PolicyError, NotFoundError } from "./errors.js";
import type { AddTranscriptRevisionRequest } from "@shared/schemas.js";

export function addWorkerRevision(
  voiceNoteId: string,
  userId: string,
  userRole: string,
  input: AddTranscriptRevisionRequest
): transcriptsRepo.TranscriptRow {
  const vn = voiceNotesRepo.findById(voiceNoteId);
  if (!vn) throw new NotFoundError("Voice note not found.");

  if (userRole === "ASHA_WORKER" && vn.created_by_user_id !== userId) {
    throw new PolicyError("You can only revise transcripts for your own voice notes.", "FORBIDDEN");
  }

  if (vn.status !== "TRANSCRIPT_READY") {
    throw new PolicyError(
      `Voice note is in status ${vn.status}. Transcript editing is only available when transcription is complete.`,
      "TRANSCRIPT_NOT_READY"
    );
  }

  const newTranscript = transcriptsRepo.create({
    voice_note_id: voiceNoteId,
    source: "WORKER_EDITED",
    language: input.language ?? "kn",
    text: input.text,
    created_by_user_id: userId,
  });

  auditEventsRepo.emit({
    actor_user_id: userId,
    entity_type: "transcript",
    entity_id: newTranscript.id,
    event_type: "WORKER_REVISION_ADDED",
    safe_payload: {
      voice_note_id: voiceNoteId,
      char_count: input.text.length,
      // text content is NOT logged — data minimization
    },
  });

  return newTranscript;
}

export function getTranscripts(
  voiceNoteId: string,
  userId: string,
  userRole: string
): transcriptsRepo.TranscriptRow[] {
  const vn = voiceNotesRepo.findById(voiceNoteId);
  if (!vn) throw new NotFoundError("Voice note not found.");

  if (userRole === "ASHA_WORKER" && vn.created_by_user_id !== userId) {
    throw new PolicyError("Access denied.", "FORBIDDEN");
  }

  return transcriptsRepo.findByVoiceNote(voiceNoteId);
}
