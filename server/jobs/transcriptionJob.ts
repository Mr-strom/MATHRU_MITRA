/**
 * MaatruMitra — Background job: transcription.
 *
 * In development: uses the fake STT provider (returns a mock transcript).
 * In production: would call a Kannada-capable STT API.
 *
 * SAFETY: This job must not make clinical assessments.
 * It only converts audio to text and stores the transcript.
 */

import * as voiceNotesRepo from "../repositories/voiceNotes.repo.js";
import * as transcriptsRepo from "../repositories/transcripts.repo.js";
import * as backgroundJobsRepo from "../repositories/backgroundJobs.repo.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import { getStorageProvider } from "../providers/storage/index.js";
import { NotFoundError } from "../services/errors.js";

// Fake STT output for development — maps to the demo fixture in the extraction provider
const FAKE_TRANSCRIPT = '"ಗೀತಾ, ಆರು ತಿಂಗಳು. ಎರಡು ವಾರದಿಂದ ಐರನ್ ಮಾತ್ರೆ ತಪ್ಪಿದೆ. ನಾಳೆ ಮನೆಗೆ ಹೋಗಬೇಕು."';

export async function runTranscriptionJob(job: backgroundJobsRepo.BackgroundJobRow): Promise<void> {
  const voiceNote = voiceNotesRepo.findById(job.entity_id);
  if (!voiceNote) throw new NotFoundError("Voice note not found for transcription job.");

  const providerName = process.env.STT_PROVIDER ?? "fake";

  let transcriptText: string;
  let confidence: string;

  if (providerName === "fake") {
    // Deterministic fake: return the demo Kannada fixture
    transcriptText = FAKE_TRANSCRIPT;
    confidence = "fake-provider:1.0";
  } else {
    // Future: call real STT API
    throw new Error(`STT provider "${providerName}" is not yet implemented.`);
  }

  // Store transcript (never overwrites any existing row)
  const transcript = transcriptsRepo.create({
    voice_note_id: voiceNote.id,
    source: "PROVIDER",
    language: voiceNote.language_declared,
    text: transcriptText,
    confidence_summary: confidence,
    provider_name: providerName,
    provider_version: "0.1.0-dev",
  });

  // Update voice note status
  voiceNotesRepo.updateStatus(voiceNote.id, "TRANSCRIPT_READY");

  auditEventsRepo.emit({
    entity_type: "voice_note",
    entity_id: voiceNote.id,
    event_type: "TRANSCRIPT_CREATED",
    previous_state: "PROCESSING",
    next_state: "TRANSCRIPT_READY",
    safe_payload: {
      transcript_id: transcript.id,
      provider: providerName,
      char_count: transcriptText.length,
      // text content not logged
    },
  });
}
