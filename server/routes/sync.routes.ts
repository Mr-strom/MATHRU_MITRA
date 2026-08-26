/**
 * MaatruMitra — Sync routes.
 *
 * Provides the authenticated endpoint for syncing individual queued offline actions.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { SyncActionRequestSchema } from "@shared/schemas.js";
import * as syncService from "../services/sync.service.js";

const router = Router();

// POST /api/v1/sync/actions — Synchronize one queued action with idempotency
router.post(
  "/actions",
  requireAuth,
  validate(SyncActionRequestSchema, "body"),
  async (req, res, next) => {
    try {
      const response = await syncService.applySyncAction(req.body, req.user!);
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
