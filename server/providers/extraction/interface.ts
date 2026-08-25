/**
 * MaatruMitra — Extraction provider interface.
 *
 * All extraction provider implementations must satisfy this interface.
 * The service layer uses only this interface — never a concrete implementation directly.
 *
 * SAFETY CONTRACT:
 * Provider output MUST conform to AdministrativeFollowUpDraft (no clinical fields).
 * The extraction service validates output and rejects non-conforming results.
 */

import type { AdministrativeFollowUpDraft } from "@shared/schemas.js";

export interface ExtractionProvider {
  readonly name: string;
  readonly version: string;

  /**
   * Extract an administrative follow-up draft from a transcript.
   * MUST return an AdministrativeFollowUpDraft or throw.
   * MUST NOT return clinical assessments, diagnoses, or medication advice.
   */
  extract(transcriptText: string, language: string): Promise<AdministrativeFollowUpDraft>;
}
