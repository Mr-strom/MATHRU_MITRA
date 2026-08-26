/**
 * MaatruMitra — Redacted structured request logging & Request ID middleware.
 *
 * SAFETY & PRIVACY:
 * - Every request receives a unique X-Request-Id header.
 * - Structured log entries record ONLY metadata: method, path (without query params), status, duration.
 * - NEVER logs transcript text, raw audio storage paths, tokens, cookies, or beneficiary aliases.
 */

import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

export interface LogContext {
  requestId: string;
  method: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  role?: string;
  error?: string;
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.header("x-request-id");
  const requestId = existingId && existingId.length < 64 ? existingId : `req_${nanoid(16)}`;
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  // Strip query string to avoid logging query parameters that could hold sensitive identifiers
  const cleanPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const logEntry: LogContext = {
      requestId: req.id ?? "unknown",
      method: req.method,
      path: cleanPath,
      statusCode: res.statusCode,
      durationMs,
    };

    if (req.user?.role) {
      logEntry.role = req.user.role;
    }

    // Only log in non-test environments or on error
    if (process.env.NODE_ENV !== "test") {
      const line = `[HTTP] ${logEntry.method} ${logEntry.path} ${logEntry.statusCode} (${logEntry.durationMs}ms) [${logEntry.requestId}]`;
      if (res.statusCode >= 500) {
        console.error(line);
      } else if (res.statusCode >= 400) {
        console.warn(line);
      } else {
        console.log(line);
      }
    }
  });

  next();
}
