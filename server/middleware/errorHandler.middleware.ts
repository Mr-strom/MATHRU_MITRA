/**
 * MaatruMitra — Error handler middleware.
 * Maps typed service errors to HTTP status codes.
 * Production-safe: never leaks stack traces or internal paths.
 */

import type { Request, Response, NextFunction } from "express";
import {
  PolicyError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  ValidationError,
  SafetyError,
} from "../services/errors.js";

const IS_DEV = process.env.NODE_ENV !== "production";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AuthError) {
    res.status(401).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN" });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message, code: "NOT_FOUND" });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(422).json({ error: err.message, code: "VALIDATION_ERROR", details: err.details });
    return;
  }
  if (err instanceof PolicyError) {
    res.status(409).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SafetyError) {
    res.status(422).json({
      error: err.message,
      code: "SAFETY_REJECTION",
      note: "The extraction output was rejected because it contained content outside the administrative follow-up scope. The source note has been preserved. A human reviewer should review the note directly.",
    });
    return;
  }

  // Unknown error — log internally, return safe generic response
  if (IS_DEV) {
    console.error("[ERROR]", err);
  }
  res.status(500).json({
    error: "An unexpected error occurred. Please try again or contact support.",
    code: "INTERNAL_ERROR",
  });
}
