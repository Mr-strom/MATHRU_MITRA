/**
 * MaatruMitra — Express application factory.
 *
 * Exports a configured Express app instance used by both the HTTP server
 * and the test suite (which imports app directly without starting a server).
 *
 * Security layers applied in order:
 *   helmet (secure headers) → CORS → cookie-parser → JSON body parser →
 *   global rate limit → API routes → static file serving → error handler
 */

import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { apiRateLimit } from "./middleware/rateLimit.middleware.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";

import authRoutes from "./routes/auth.routes.js";
import voiceNotesRoutes from "./routes/voiceNotes.routes.js";
import followUpDraftsRoutes from "./routes/followUpDrafts.routes.js";
import tasksRoutes from "./routes/tasks.routes.js";
import sopRoutes from "./routes/sop.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import beneficiaryRefsRoutes from "./routes/beneficiaryRefs.routes.js";
import usersRoutes from "./routes/users.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === "production";

const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

export function createApp() {
  const app = express();

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: IS_PROD
        ? undefined
        : false, // relax CSP in dev for Vite HMR
    })
  );

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || CORS_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
      },
      credentials: true,
    })
  );

  // ── Body parsing ─────────────────────────────────────────────────────────────
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  // ── Global API rate limit ──────────────────────────────────────────────────
  app.use("/api/", apiRateLimit);

  // ── API routes ─────────────────────────────────────────────────────────────
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1", authRoutes); // Handles GET /api/v1/me
  app.use("/api/v1/users", usersRoutes);
  app.use("/api/v1/beneficiary-refs", beneficiaryRefsRoutes);
  app.use("/api/v1/voice-notes", voiceNotesRoutes);
  app.use("/api/v1/follow-up-drafts", followUpDraftsRoutes);
  app.use("/api/v1/tasks", tasksRoutes);
  app.use("/api/v1/sop-excerpts", sopRoutes);
  app.use("/api/v1/audit-events", auditRoutes);

  // ── Health check ───────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      prototype: true,
      notice: "MaatruMitra prototype — No live patient data.",
    });
  });

  // ── Static files (production) ──────────────────────────────────────────────
  const staticPath = IS_PROD
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");

  if (IS_PROD) {
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  // ── Error handler (must be last) ───────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
