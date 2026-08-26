/**
 * MaatruMitra — Synthetic Beneficiary Reference routes.
 *
 * Provides a strictly protected synthetic demo fixture endpoint.
 * Refuses arbitrary queries, patient searches, or real patient identifiers.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as beneficiaryRepo from "../repositories/beneficiaryRefs.repo.js";
import { NotFoundError, ForbiddenError } from "../services/errors.js";

const router = Router();

// GET /api/v1/beneficiary-refs/demo — Returns the seeded synthetic demo fixture only
router.get("/demo", requireAuth, (req, res, next) => {
  try {
    const user = req.user!;
    const demoRef =
      beneficiaryRepo.findByAlias("BEN-DEMO-001") ??
      beneficiaryRepo.findByAlias("BEN-TEST-001");

    if (!demoRef) {
      throw new NotFoundError("Synthetic demo beneficiary fixture not found. Ensure database is seeded.");
    }

    // Enforce area boundary: if user has assigned area, must match fixture area
    if (user.role !== "PHC_ADMIN" && user.assigned_area_id && demoRef.area_id !== user.assigned_area_id) {
      throw new ForbiddenError("Access denied: synthetic fixture belongs to a different area.");
    }

    res.json({
      id: demoRef.id,
      external_reference_alias: demoRef.external_reference_alias,
      area_id: demoRef.area_id,
      consent_status: demoRef.consent_status,
      fixture: true,
      notice: "PROTOTYPE — Synthetic beneficiary reference for demonstration only. No live patient data.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
