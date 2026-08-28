/**
 * MaatruMitra — PHC Admin routes.
 *
 * Provides development-only demo environment reset capabilities.
 * Strictly blocked in production environments.
 */

import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { runMigrations } from "../db/migrate.js";
import { seed } from "../db/seed.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";
import * as reportingService from "../services/reporting.service.js";
import { PolicyError } from "../services/errors.js";

const router = Router();

// POST /api/v1/admin/demo-reset — Reset database schema, seed fixtures, and clear local upload directory
router.post(
  "/demo-reset",
  requireAuth,
  requireRole("PHC_ADMIN"),
  async (req, res, next) => {
    try {
      // 1. Enforce development-only safety barrier
      if (process.env.NODE_ENV === "production") {
        throw new PolicyError(
          "Demo reset action is strictly disabled in production environments.",
          "DEV_ONLY"
        );
      }

      // 2. Drop and rerun migrations
      await runMigrations({ reset: true, silent: true });

      // 3. Re-seed synthetic fixtures
      await seed({ silent: true });

      // 4. Safely clean local uploads directory (dev only)
      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");
      if (fs.existsSync(uploadDir)) {
        try {
          const files = fs.readdirSync(uploadDir);
          for (const file of files) {
            const fullPath = path.join(uploadDir, file);
            if (fs.statSync(fullPath).isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(fullPath);
            }
          }
        } catch {
          // Non-fatal if folder is locked or empty
        }
      }

      // 5. Emit audit event (actor_user_id is null since database tables were re-seeded)
      const resetAt = new Date().toISOString();
      auditEventsRepo.emit({
        actor_user_id: null,
        entity_type: "system",
        entity_id: "demo_environment",
        event_type: "DEMO_ENVIRONMENT_RESET",
        safe_payload: {
          reset_by_role: req.user!.role,
          reset_at: resetAt,
        },
      });

      res.json({
        success: true,
        message: "Synthetic demo environment and storage reset successfully.",
        notice: "PROTOTYPE — Fictional demo identities and synthetic fixtures restored.",
        reset_at: resetAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/reports/operational — Retrieve operational supervisor aggregate metrics
router.get(
  "/reports/operational",
  requireAuth,
  requireRole("PHC_ADMIN"),
  async (req, res, next) => {
    try {
      const report = await reportingService.getOperationalReport(req.user!);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/reports/export — Export sanitized operational aggregate report (CSV or JSON)
router.get(
  "/reports/export",
  requireAuth,
  requireRole("PHC_ADMIN"),
  async (req, res, next) => {
    try {
      const format = req.query.format === "json" ? "json" : "csv";
      const { contentType, filename, content } = await reportingService.exportOperationalReport(
        req.user!,
        format
      );

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(content);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
