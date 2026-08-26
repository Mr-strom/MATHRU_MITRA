/**
 * MaatruMitra — Voice note service.
 *
 * Manages creation of upload intents and submission for transcription.
 * Consent is checked before accepting any voice note record.
 * Audio files are handled by the StorageProvider abstraction.
 */

import * as voiceNotesRepo from "../repositories/voiceNotes.repo.js";
import * as beneficiaryRepo from "../repositories/beneficiaryRefs.repo.js";
import * as backgroundJobsRepo from "../repositories/backgroundJobs.repo.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import { getStorageProvider } from "../providers/storage/index.js";
import { PolicyError, NotFoundError } from "./errors.js";
import type { CreateVoiceNoteRequest } from "@shared/schemas.js";

const ALLOWED_MIME_TYPES = (
  process.env.ALLOWED_MIME_TYPES ??
  "audio/webm,audio/ogg,audio/wav,audio/mp4,audio/mpeg,audio/flac"
).split(",");

const MAX_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES ?? "26214400", 10);

export async function createUploadIntent(
  userId: string,
  input: CreateVoiceNoteRequest
): Promise<{ voiceNote: voiceNotesRepo.VoiceNoteRow; uploadUrl: string }> {
  // 1. Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(input.mime_type)) {
    throw new PolicyError(
      `File type ${input.mime_type} is not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
      "UNSUPPORTED_MIME_TYPE"
    );
  }

  // 2. Validate file size
  if (input.byte_size > MAX_BYTES) {
    throw new PolicyError(
      `File size ${input.byte_size} bytes exceeds the ${MAX_BYTES} byte limit.`,
      "FILE_TOO_LARGE"
    );
  }

  // 3. Check beneficiary exists
  const benRef = beneficiaryRepo.findById(input.beneficiary_reference_id);
  if (!benRef) {
    throw new NotFoundError("Beneficiary reference not found.");
  }

  // 4. Check consent — required before accepting audio
  if (!beneficiaryRepo.hasActiveConsent(input.beneficiary_reference_id)) {
    throw new PolicyError(
      "Active consent is required before recording a voice note for this beneficiary reference. " +
        "Consent status: " + (benRef.consent_status ?? "UNKNOWN"),
      "CONSENT_REQUIRED"
    );
  }

  // 5. Generate storage key and get upload URL from provider
  const storage = getStorageProvider();
  const storageKey = storage.generateKey(userId, input.mime_type);
  const uploadUrl = await storage.getUploadUrl(storageKey);

  // 6. Create voice note record
  const voiceNote = voiceNotesRepo.create({
    beneficiary_reference_id: input.beneficiary_reference_id,
    created_by_user_id: userId,
    storage_key: storageKey,
    mime_type: input.mime_type,
    byte_size: input.byte_size,
    duration_seconds: input.duration_seconds,
    language_declared: input.language_declared ?? "kn",
    consent_snapshot: input.consent_snapshot ?? `consent_given_at:${new Date().toISOString()}`,
  });

  // 7. Emit audit event
  auditEventsRepo.emit({
    actor_user_id: userId,
    entity_type: "voice_note",
    entity_id: voiceNote.id,
    event_type: "UPLOAD_INTENT_CREATED",
    safe_payload: {
      mime_type: input.mime_type,
      byte_size: input.byte_size,
      language: input.language_declared,
    },
  });

  return { voiceNote, uploadUrl };
}

export async function submitForTranscription(voiceNoteId: string, userId: string): Promise<void> {
  const vn = voiceNotesRepo.findById(voiceNoteId);
  if (!vn) throw new NotFoundError("Voice note not found.");
  if (vn.created_by_user_id !== userId) {
    throw new PolicyError("You can only submit your own voice notes.", "FORBIDDEN");
  }
  if (vn.status !== "DRAFT") {
    throw new PolicyError(
      `Voice note is in status ${vn.status}. Only DRAFT notes can be submitted.`,
      "ILLEGAL_STATUS"
    );
  }

  // Ensure audio file has actually been uploaded / attached
  const storage = getStorageProvider();
  const fileExists = await storage.hasObject(vn.storage_key);
  if (!fileExists) {
    throw new PolicyError(
      "No audio file attached to this voice note. Upload audio before submitting.",
      "AUDIO_NOT_ATTACHED"
    );
  }

  voiceNotesRepo.updateStatus(voiceNoteId, "PROCESSING");

  const idempotencyKey = `transcription:${voiceNoteId}`;
  backgroundJobsRepo.enqueue("TRANSCRIPTION", voiceNoteId, idempotencyKey);

  auditEventsRepo.emit({
    actor_user_id: userId,
    entity_type: "voice_note",
    entity_id: voiceNoteId,
    event_type: "SUBMITTED_FOR_TRANSCRIPTION",
    previous_state: "DRAFT",
    next_state: "PROCESSING",
  });
}

export function getAuthorized(
  voiceNoteId: string,
  userId: string,
  userRole: string,
  userAreaId: string | null
): voiceNotesRepo.VoiceNoteRow {
  const vn = voiceNotesRepo.findById(voiceNoteId);
  if (!vn) throw new NotFoundError("Voice note not found.");

  // ASHA can only see their own notes
  if (userRole === "ASHA_WORKER") {
    if (vn.created_by_user_id !== userId) {
      throw new PolicyError("Access denied: you can only view your own voice notes.", "FORBIDDEN");
    }
    return vn;
  }

  // ANM must be in the same area as the beneficiary
  if (userRole === "ANM_REVIEWER") {
    const benRef = beneficiaryRepo.findById(vn.beneficiary_reference_id);
    if (!benRef || !userAreaId || benRef.area_id !== userAreaId) {
      throw new PolicyError("Access denied: voice note belongs to a different area.", "FORBIDDEN");
    }
    return vn;
  }

  // PHC_ADMIN can view if unassigned, or if assigned, within same area
  if (userRole === "PHC_ADMIN") {
    if (userAreaId) {
      const benRef = beneficiaryRepo.findById(vn.beneficiary_reference_id);
      if (!benRef || benRef.area_id !== userAreaId) {
        throw new PolicyError("Access denied: voice note belongs to a different area.", "FORBIDDEN");
      }
    }
    return vn;
  }

  throw new PolicyError("Access denied.", "FORBIDDEN");
}
