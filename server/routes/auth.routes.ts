/**
 * MaatruMitra — Auth routes.
 * POST /api/v1/auth/login   — Development login with rate limiting
 * POST /api/v1/auth/logout  — Revoke all user tokens
 * GET  /api/v1/me           — Return authenticated user
 * POST /api/v1/auth/refresh — Refresh access token
 */

import { Router } from "express";
import { login, revokeAllUserTokens, refresh } from "../services/auth.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { authRateLimit } from "../middleware/rateLimit.middleware.js";
import { LoginRequestSchema } from "@shared/schemas.js";
import { z } from "zod";

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: (process.env.COOKIE_SAME_SITE ?? "lax") as "strict" | "lax" | "none",
  path: "/",
};

const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

router.post(
  "/login",
  authRateLimit,
  validate(LoginRequestSchema),
  async (req, res, next) => {
    try {
      const { user, accessToken, refreshToken } = await login(
        req.body.username,
        req.body.password
      );
      res
        .cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: ACCESS_MAX_AGE })
        .cookie("refresh_token", refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_MAX_AGE })
        .json({
          user: {
            id: user.id,
            display_name: user.display_name,
            role: user.role,
            assigned_area_id: user.assigned_area_id,
          },
          /** Note: tokens are in HTTP-only cookies, not in this response body */
        });
    } catch (err) {
      next(err);
    }
  }
);

router.post("/logout", requireAuth, (req, res) => {
  revokeAllUserTokens(req.user!.id);
  res
    .clearCookie("access_token", { path: "/" })
    .clearCookie("refresh_token", { path: "/" })
    .json({ message: "Logged out successfully." });
});

router.post(
  "/refresh",
  validate(z.object({ refresh_token: z.string().optional() })),
  async (req, res, next) => {
    const rawToken = req.cookies?.refresh_token ?? req.body?.refresh_token;
    if (!rawToken) {
      res.status(401).json({ error: "Refresh token required.", code: "REFRESH_TOKEN_MISSING" });
      return;
    }
    try {
      const { user, accessToken, newRefreshToken } = await refresh(rawToken);
      res
        .cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: ACCESS_MAX_AGE })
        .cookie("refresh_token", newRefreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_MAX_AGE })
        .json({
          user: {
            id: user.id,
            display_name: user.display_name,
            role: user.role,
            assigned_area_id: user.assigned_area_id,
          },
        });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/me", requireAuth, (req, res) => {
  const u = req.user!;
  res.json({
    id: u.id,
    display_name: u.display_name,
    role: u.role,
    assigned_area_id: u.assigned_area_id,
    status: u.status,
  });
});

export default router;
