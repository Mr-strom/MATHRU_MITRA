/**
 * MaatruMitra — Deterministic fake extraction provider.
 *
 * Used for all local development and test runs.
 * Maps known transcript fixtures to pre-canned administrative drafts.
 * Demonstrates the expected output shape without any real AI call.
 *
 * SAFETY: This provider only returns administrative fields.
 * It demonstrates that clinical terms must be rejected — see the UNSAFE fixture below.
 */

import type { ExtractionProvider } from "./interface.js";
import type { AdministrativeFollowUpDraft } from "@shared/schemas.js";

// Deterministic fixture map keyed by recognizable transcript substrings
const FIXTURES: Array<{
  matchKeyword: string;
  draft: AdministrativeFollowUpDraft;
}> = [
  {
    matchKeyword: "ಐರನ್ ಮಾತ್ರೆ",   // "iron tablet" in Kannada
    draft: {
      beneficiary_reference_alias: "BEN-DEMO-001",
      area_reference: "Ward 03, Chitradurga",
      observed_timing_text: "Two weeks ago",
      worker_observation_summary:
        "ASHA worker reports that the beneficiary's iron-folic acid supplement routine has been interrupted for approximately two weeks. A home visit has been proposed for the following day to reinstate the routine.",
      follow_up_category: "SUPPLEMENT_ROUTINE_NOTE",
      proposed_owner_role: "ANM_REVIEWER",
      proposed_due_at: null,
      source_evidence: [
        {
          transcript_quote: "ಎರಡು ವಾರದಿಂದ ಐರನ್ ಮಾತ್ರೆ ತಪ್ಪಿದೆ",
          transcript_start: 0,
          transcript_end: 38,
        },
        {
          transcript_quote: "ನಾಳೆ ಮನೆಗೆ ಹೋಗಬೇಕು",
          transcript_start: 39,
        },
      ],
      required_human_review: true,
      uncertainty_note:
        "Exact interruption duration and reason not specified. ANM should verify before action. This is an administrative note only — not a clinical assessment.",
    },
  },
  {
    matchKeyword: "missed contact",
    draft: {
      beneficiary_reference_alias: null,
      area_reference: null,
      observed_timing_text: null,
      worker_observation_summary:
        "ASHA worker reports that the beneficiary could not be contacted during the scheduled outreach visit.",
      follow_up_category: "MISSED_CONTACT",
      proposed_owner_role: "ASHA_WORKER",
      proposed_due_at: null,
      source_evidence: [
        { transcript_quote: "missed contact" },
      ],
      required_human_review: true,
      uncertainty_note:
        "Reason for missed contact not specified. Worker should record the reason in the register before submitting for review.",
    },
  },
];

const DEFAULT_DRAFT: AdministrativeFollowUpDraft = {
  beneficiary_reference_alias: null,
  area_reference: null,
  observed_timing_text: null,
  worker_observation_summary:
    "Administrative follow-up required. The ASHA worker's field note has been received. Details require human review before any action is taken.",
  follow_up_category: "REVIEW_REQUIRED",
  proposed_owner_role: "ANM_REVIEWER",
  proposed_due_at: null,
  source_evidence: [],
  required_human_review: true,
  uncertainty_note:
    "This draft was produced by the deterministic fake extraction provider for development and testing. It does not represent a real clinical assessment.",
};

export class FakeExtractionProvider implements ExtractionProvider {
  readonly name = "fake-extraction-provider";
  readonly version = "0.1.0-dev";

  async extract(transcriptText: string): Promise<AdministrativeFollowUpDraft> {
    const lower = transcriptText.toLowerCase();
    for (const fixture of FIXTURES) {
      if (lower.includes(fixture.matchKeyword.toLowerCase())) {
        return { ...fixture.draft };
      }
    }
    return { ...DEFAULT_DRAFT };
  }
}
