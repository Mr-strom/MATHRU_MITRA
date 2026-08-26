/**
 * MaatruMitra — Demo readiness diagnostic route.
 *
 * Provides a lightweight status check for the authenticated workspace checklist.
 * Validates database readiness, fake provider status, and fixture availability.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getDb } from "../db/client.js";
import { checkSchemaReady } from "../db/migrate.js";
import * as beneficiaryRepo from "../repositories/beneficiaryRefs.repo.js";

const router = Router();

// GET /api/v1/demo/readiness — System readiness diagnostic for demo environment
router.get("/readiness", requireAuth, (_req, res, next) => {
  try {
    const db = getDb();
    const schemaOk = checkSchemaReady(db);
    const fixture =
      beneficiaryRepo.findByAlias("BEN-DEMO-001") ??
      beneficiaryRepo.findByAlias("BEN-TEST-001");

    const checks = {
      api: "ready",
      database_schema: schemaOk ? "ready" : "unmigrated",
      fake_providers: {
        stt: "fake_provider_active",
        extraction: "fake_provider_active",
      },
      synthetic_fixture: fixture ? "ready" : "missing",
      messaging_safety: "DISABLED (Permanent DB constraint)",
    };

    const isAllReady = schemaOk && !!fixture;

    res.json({
      status: isAllReady ? "ready" : "degraded",
      checks,
      notice: "PROTOTYPE — Synthetic verification mode. No live patient data.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
