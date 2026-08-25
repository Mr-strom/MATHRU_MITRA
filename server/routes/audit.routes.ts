/**
 * MaatruMitra — Audit log routes.
 * PHC_ADMIN only.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { PaginationQuerySchema } from "@shared/schemas.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import { z } from "zod";

const router = Router();

const AuditQuerySchema = PaginationQuerySchema.extend({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
});

// GET /audit-events — PHC_ADMIN only
router.get(
  "/",
  requireAuth,
  requireRole("PHC_ADMIN"),
  validate(AuditQuerySchema, "query"),
  (req, res, next) => {
    try {
      const { cursor, limit, entity_type, entity_id } =
        req.query as unknown as {
          cursor?: string;
          limit: number;
          entity_type?: string;
          entity_id?: string;
        };

      let events;
      if (entity_type && entity_id) {
        events = auditEventsRepo.findByEntity(entity_type, entity_id, limit);
      } else {
        events = auditEventsRepo.findRecent(cursor, limit);
      }

      res.json({
        items: events,
        next_cursor:
          events.length === limit
            ? events[events.length - 1]?.created_at ?? null
            : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
