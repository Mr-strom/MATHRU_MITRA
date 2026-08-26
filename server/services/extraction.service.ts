/**
 * MaatruMitra — Extraction service.
 *
 * Runs extraction via the configured ExtractionProvider.
 * VALIDATES output against AdministrativeFollowUpDraftSchema.
 * REJECTS any output containing clinical terminology.
 *
 * SAFETY: This service is the enforcement point for the non-diagnostic boundary.
 * Any provider output that contains clinical assessment terms, diagnoses,
 * medication advice, or risk scores is rejected before it can reach the database.
 */

import { AdministrativeFollowUpDraftSchema } from "@shared/schemas.js";
import { getExtractionProvider } from "../providers/extraction/index.js";
import * as transcriptsRepo from "../repositories/transcripts.repo.js";
import * as draftsRepo from "../repositories/followUpDrafts.repo.js";
import * as backgroundJobsRepo from "../repositories/backgroundJobs.repo.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import * as sopCitation from "./sopCitation.service.js";
import { NotFoundError, SafetyError, ValidationError } from "./errors.js";

// ── Clinical term blocklist ───────────────────────────────────────────────────
// Any provider output containing these terms in free-text fields is rejected.
// This list is a first-line safeguard; it does not replace governance review.
const CLINICAL_TERM_BLOCKLIST = [
  // Diagnosis terms
  "diagnosis", "diagnosed", "condition", "disorder", "disease",
  "syndrome", "infection", "anaemia", "anemia", "hypertension",
  "pre-eclampsia", "eclampsia", "gestational diabetes",
  // Risk terms
  "high risk", "low risk", "risk score", "risk level", "critical",
  "emergency", "urgent care", "hospitalize", "admit",
  // Treatment terms
  "prescribe", "prescription", "medication", "dose", "dosage",
  "tablet", "mg", "ml", "treatment plan", "therapy", "surgery",
  // Note: "tablet" alone could be legitimate in context of "missed tablet" —
  // the extraction schema uses follow_up_category instead of free-text medicine names.
  // This blocklist targets clinical *instructions* in summary fields.
];

function containsClinicalTerms(text: string): string | null {
  const lower = text.toLowerCase();
  for (const term of CLINICAL_TERM_BLOCKLIST) {
    if (lower.includes(term)) return term;
  }
  return null;
}

function validateNoClinicalContent(draft: unknown): void {
  const d = draft as Record<string, unknown>;

  for (const field of ["worker_observation_summary", "uncertainty_note"]) {
    const value = d[field];
    if (typeof value === "string") {
      const found = containsClinicalTerms(value);
      if (found) {
        throw new SafetyError(
          `Extraction output contains a clinical term ("${found}") in field "${field}". ` +
          "This output has been rejected. Administrative fields must not contain clinical assessments, " +
          "diagnoses, medication advice, or risk scores. Please review the source note manually."
        );
      }
    }
  }
}

export async function runExtraction(
  transcriptId: string,
  jobId?: string
): Promise<draftsRepo.FollowUpDraftRow> {
  const transcript = transcriptsRepo.findById(transcriptId);
  if (!transcript) throw new NotFoundError("Transcript not found.");

  const provider = getExtractionProvider();

  let rawOutput: unknown;
  try {
    rawOutput = await provider.extract(transcript.text, transcript.language);
  } catch (err) {
    if (jobId) backgroundJobsRepo.markFailed(jobId, "Provider extraction call failed.");
    throw err;
  }

  // 1. Validate against schema
  const parsed = AdministrativeFollowUpDraftSchema.safeParse(rawOutput);
  if (!parsed.success) {
    const safeErr = "Extraction output did not conform to administrative schema.";
    if (jobId) backgroundJobsRepo.markFailed(jobId, safeErr);
    throw new ValidationError(safeErr, parsed.error.flatten());
  }

  // 2. Clinical term check
  validateNoClinicalContent(parsed.data);

  // 3. Find best SOP citation (keyword match on category + summary)
  const keywords = [
    parsed.data.follow_up_category.replace(/_/g, " "),
    parsed.data.worker_observation_summary.substring(0, 60),
  ].join(" ");
  const citations = sopCitation.search(keywords, 1);
  const citationId = citations[0]?.id ?? null;

  // 4. Create draft
  const draft = draftsRepo.create({
    voice_note_id: transcript.voice_note_id,
    transcript_id: transcriptId,
    administrative_category: parsed.data.follow_up_category,
    summary: parsed.data.worker_observation_summary,
    proposed_due_at: parsed.data.proposed_due_at ?? undefined,
    extraction_confidence: parsed.data.uncertainty_note ? "uncertain" : "standard",
    extraction_raw_json: JSON.stringify(parsed.data),
    citation_id: citationId ?? undefined,
  });

  auditEventsRepo.emit({
    entity_type: "follow_up_draft",
    entity_id: draft.id,
    event_type: "DRAFT_CREATED_FROM_EXTRACTION",
    next_state: "TRANSCRIPT_READY",
    safe_payload: {
      transcript_id: transcriptId,
      provider: provider.name,
      provider_version: provider.version,
      category: parsed.data.follow_up_category,
      citation_found: !!citationId,
      required_human_review: true,
    },
  });

  if (jobId) backgroundJobsRepo.markDone(jobId);

  return draft;
}

export async function queueExtraction(transcriptId: string): Promise<void> {
  const idempotencyKey = `extraction:${transcriptId}`;
  const { enqueue } = await import("../repositories/backgroundJobs.repo.js");
  enqueue("EXTRACTION", transcriptId, idempotencyKey);
}
