/**
 * MaatruMitra — Auth middleware.
 *
 * requireAuth: verifies access token from HTTP-only cookie, attaches user to req.
 * requireRole: checks that the authenticated user has one of the allowed roles.
 * requireAreaAccess: checks that the user's area matches the requested resource area.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service.js";
import * as usersRepo from "../repositories/users.repo.js";
import type { Role } from "@shared/roles.js";

declare global {
  namespace Express {
    interface Request {
      user?: usersRepo.SafeUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token =
    req.cookies?.access_token ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const user = usersRepo.findSafeById(payload.sub);
    if (!user || user.status !== "ACTIVE") {
      res.status(401).json({ error: "Account is inactive or not found.", code: "ACCOUNT_INACTIVE" });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session.", code: "TOKEN_INVALID" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
      return;
    }
    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({
        error: `This action requires one of the following roles: ${roles.join(", ")}.`,
        code: "INSUFFICIENT_ROLE",
      });
      return;
    }
    next();
  };
}

/** Checks that the user's assigned area matches the given area ID. PHC_ADMIN bypasses. */
export function requireAreaAccess(getAreaId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
      return;
    }
    if (req.user.role === "PHC_ADMIN") {
      next();
      return;
    }
    const resourceArea = getAreaId(req);
    if (resourceArea && req.user.assigned_area_id !== resourceArea) {
      res.status(403).json({
        error: "Access denied: resource belongs to a different area.",
        code: "AREA_ACCESS_DENIED",
      });
      return;
    }
    next();
  };
}
