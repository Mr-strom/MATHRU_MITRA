/**
 * MaatruMitra — Rate limit middleware.
 * Strict limits on auth and upload-initiation endpoints.
 */

import rateLimit from "express-rate-limit";

export const authRateLimit = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? "900000", 10), // 15 min
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? "20", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please wait and try again.",
    code: "RATE_LIMITED",
  },
  skipSuccessfulRequests: false,
});

export const uploadRateLimit = rateLimit({
  windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS ?? "300000", 10), // 5 min
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX ?? "10", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many upload attempts. Please wait and try again.",
    code: "RATE_LIMITED",
  },
});

export const apiRateLimit = rateLimit({
  windowMs: 60_000, // 1 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down.",
    code: "RATE_LIMITED",
  },
});
