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

import { AuthError, ForbiddenError } from "../services/errors.js";

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
    next(new AuthError("Authentication required.", "UNAUTHENTICATED"));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const user = usersRepo.findSafeById(payload.sub);
    if (!user || user.status !== "ACTIVE") {
      next(new AuthError("Account is inactive or not found.", "ACCOUNT_INACTIVE"));
      return;
    }
    req.user = user;
    next();
  } catch {
    next(new AuthError("Invalid or expired session.", "TOKEN_INVALID"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthError("Authentication required.", "UNAUTHENTICATED"));
      return;
    }
    if (!roles.includes(req.user.role as Role)) {
      next(
        new ForbiddenError(
          `This action requires one of the following roles: ${roles.join(", ")}.`
        )
      );
      return;
    }
    next();
  };
}

/** Checks that the user's assigned area matches the given area ID. PHC_ADMIN bypasses. */
export function requireAreaAccess(getAreaId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthError("Authentication required.", "UNAUTHENTICATED"));
      return;
    }
    if (req.user.role === "PHC_ADMIN") {
      next();
      return;
    }
    const resourceArea = getAreaId(req);
    if (resourceArea && req.user.assigned_area_id !== resourceArea) {
      next(new ForbiddenError("Access denied: resource belongs to a different area."));
      return;
    }
    next();
  };
}
