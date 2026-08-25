/**
 * MaatruMitra — SOP citation search routes.
 * Returns only APPROVED, ACTIVE excerpts.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { z } from "zod";
import { validate } from "../middleware/validate.middleware.js";
import * as sopCitation from "../services/sopCitation.service.js";

const router = Router();

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// GET /sop-excerpts/search?q=...
router.get(
  "/search",
  requireAuth,
  validate(SearchQuerySchema, "query"),
  (req, res, next) => {
    try {
      const { q, limit } = req.query as unknown as { q: string; limit: number };
      const results = sopCitation.search(q, limit);
      res.json({
        excerpts: results.map((r) => ({
          id: r.id,
          section_label: r.section_label,
          page_reference: r.page_reference,
          excerpt_text: r.excerpt_text,
          tags: r.tags_parsed,
          document: {
            title: r.document.title,
            version: r.document.version,
            effective_date: r.document.effective_date,
          },
          citation_note:
            "Administrative guidance only. Verify against the current approved version before action.",
        })),
        total: results.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
