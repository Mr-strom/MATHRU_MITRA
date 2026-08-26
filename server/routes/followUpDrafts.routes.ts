/**
 * MaatruMitra — Follow-up drafts routes.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  CreateDraftFromTranscriptSchema,
  SubmitReviewSchema,
  ANMConfirmSchema,
  ANMReviseSchema,
  ANMDismissSchema,
  PaginationQuerySchema,
} from "@shared/schemas.js";
import * as draftsRepo from "../repositories/followUpDrafts.repo.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import * as sopRepo from "../repositories/sopExcerpts.repo.js";
import * as reviewWorkflow from "../services/reviewWorkflow.service.js";
import * as extractionService from "../services/extraction.service.js";
import { NotFoundError, PolicyError } from "../services/errors.js";

const router = Router();

// POST /follow-up-drafts/from-transcript
router.post(
  "/from-transcript",
  requireAuth,
  requireRole("ASHA_WORKER", "ANM_REVIEWER"),
  validate(CreateDraftFromTranscriptSchema),
  async (req, res, next) => {
    try {
      const transcript = await import("../repositories/transcripts.repo.js").then((m) =>
        m.findById(req.body.transcript_id)
      );
      if (!transcript) throw new NotFoundError("Transcript not found.");

      // Check caller authorization on the source voice note
      const voiceNoteService = await import("../services/voiceNote.service.js");
      voiceNoteService.getAuthorized(
        transcript.voice_note_id,
        req.user!.id,
        req.user!.role,
        req.user!.assigned_area_id
      );

      const draft = await extractionService.runExtraction(req.body.transcript_id);
      res.status(201).json({
        draft,
        notice:
          "ADMINISTRATIVE DRAFT ONLY. This record requires human review before any action is taken. No clinical assessment has been made.",
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /follow-up-drafts — Role/area-scoped queue
router.get(
  "/",
  requireAuth,
  validate(PaginationQuerySchema, "query"),
  (req, res, next) => {
    try {
      const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
      const user = req.user!;
      let drafts: ReturnType<typeof draftsRepo.findByCreator>;

      if (user.role === "ANM_REVIEWER" || user.role === "PHC_ADMIN") {
        drafts = draftsRepo.findAwaitingReview(
          user.role === "ANM_REVIEWER" ? (user.assigned_area_id ?? undefined) : undefined,
          cursor,
          limit
        );
      } else {
        drafts = draftsRepo.findByCreator(user.id, cursor, limit);
      }

      res.json({
        items: drafts,
        next_cursor: drafts.length === limit ? drafts[drafts.length - 1]?.created_at ?? null : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /follow-up-drafts/:id
router.get("/:id", requireAuth, (req, res, next) => {
  try {
    const draft = reviewWorkflow.getAuthorizedDraft(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.user!.assigned_area_id
    );

    const auditHistory = auditEventsRepo.findByEntity("follow_up_draft", draft.id, 20);
    const citation = draft.citation_id ? sopRepo.findById(draft.citation_id) : null;

    res.json({ draft, audit_history: auditHistory, citation });
  } catch (err) {
    next(err);
  }
});

// POST /follow-up-drafts/:id/mark-reviewed — Worker reviews draft (TRANSCRIPT_READY -> WORKER_REVIEWED)
router.post(
  "/:id/mark-reviewed",
  requireAuth,
  requireRole("ASHA_WORKER"),
  (req, res, next) => {
    try {
      const draft = reviewWorkflow.markWorkerReviewed(
        req.params.id,
        req.user!.id,
        req.user!.role
      );
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  }
);

// POST /follow-up-drafts/:id/submit-review — Submits reviewed draft to ANM queue
router.post(
  "/:id/submit-review",
  requireAuth,
  requireRole("ASHA_WORKER"),
  validate(SubmitReviewSchema),
  (req, res, next) => {
    try {
      const draft = reviewWorkflow.submitForReview(
        req.params.id,
        req.user!.id,
        req.body.worker_note,
        req.user!.role
      );
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  }
);

// POST /follow-up-drafts/:id/confirm
router.post(
  "/:id/confirm",
  requireAuth,
  requireRole("ANM_REVIEWER", "PHC_ADMIN"),
  validate(ANMConfirmSchema),
  (req, res, next) => {
    try {
      const result = reviewWorkflow.confirm(
        req.params.id,
        req.user!.id,
        req.body,
        req.user!.role,
        req.user!.assigned_area_id
      );
      res.json({
        draft: result.draft,
        task: result.task,
        notice:
          "Task created and open for acknowledgement. No automated messages have been sent.",
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /follow-up-drafts/:id/revise
router.post(
  "/:id/revise",
  requireAuth,
  requireRole("ANM_REVIEWER", "PHC_ADMIN"),
  validate(ANMReviseSchema),
  (req, res, next) => {
    try {
      const draft = reviewWorkflow.revise(
        req.params.id,
        req.user!.id,
        req.body,
        req.user!.role,
        req.user!.assigned_area_id
      );
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  }
);

// POST /follow-up-drafts/:id/dismiss
router.post(
  "/:id/dismiss",
  requireAuth,
  requireRole("ANM_REVIEWER", "PHC_ADMIN"),
  validate(ANMDismissSchema),
  (req, res, next) => {
    try {
      const draft = reviewWorkflow.dismiss(
        req.params.id,
        req.user!.id,
        req.body,
        req.user!.role,
        req.user!.assigned_area_id
      );
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
