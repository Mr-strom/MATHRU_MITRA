/**
 * MaatruMitra — Auth service.
 *
 * Handles login, token issuance, refresh, and logout.
 * Access tokens: signed JWT, 15 min TTL, HTTP-only cookie.
 * Refresh tokens: random bytes, bcrypt-hashed, stored in DB with expiry.
 * Raw tokens are never logged or stored.
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { nanoid } from "nanoid";
import * as usersRepo from "../repositories/users.repo.js";
import { getDb } from "../db/client.js";
import { AuthError } from "./errors.js";
import type { SafeUser } from "../repositories/users.repo.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-replace-in-production";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-replace-in-production";
const ACCESS_EXPIRES = (process.env.JWT_ACCESS_EXPIRES_IN ?? "15m") as string;
const REFRESH_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? "7", 10);

export interface TokenPayload {
  sub: string;  // user id
  role: string;
  area: string | null;
}

export function issueAccessToken(user: SafeUser): string {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    area: user.assigned_area_id,
  };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
  } catch {
    throw new AuthError("Invalid or expired access token.");
  }
}

export async function login(username: string, password: string): Promise<{
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}> {
  const userRow = usersRepo.findByUsername(username);
  if (!userRow || userRow.status !== "ACTIVE") {
    // Timing-safe: always compare even if user not found
    await bcrypt.compare(password, "$2b$12$invalidhashtopreventtiming00000000000000000000000");
    throw new AuthError("Invalid username or password.", "INVALID_CREDENTIALS");
  }

  if (!userRow.password_hash) {
    throw new AuthError("This account uses external authentication.", "EXTERNAL_AUTH_REQUIRED");
  }

  const valid = await bcrypt.compare(password, userRow.password_hash);
  if (!valid) {
    throw new AuthError("Invalid username or password.", "INVALID_CREDENTIALS");
  }

  const safeUser: SafeUser = {
    id: userRow.id,
    username: userRow.username,
    display_name: userRow.display_name,
    role: userRow.role,
    assigned_area_id: userRow.assigned_area_id,
    status: userRow.status,
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
  };

  const accessToken = issueAccessToken(safeUser);
  const { raw: refreshToken, hash } = await generateRefreshToken();

  storeRefreshToken(userRow.id, hash, REFRESH_DAYS);

  return { user: safeUser, accessToken, refreshToken };
}

async function generateRefreshToken(): Promise<{ raw: string; hash: string }> {
  const raw = nanoid(64);
  const hash = await bcrypt.hash(raw, 10);
  return { raw, hash };
}

function storeRefreshToken(userId: string, tokenHash: string, days: number): void {
  const id = nanoid();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  getDb().prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, tokenHash, expiresAt);
}

export async function refresh(rawRefreshToken: string): Promise<{
  user: SafeUser;
  accessToken: string;
  newRefreshToken: string;
}> {
  const db = getDb();
  // Find non-revoked, non-expired refresh tokens for potential match
  const candidates = db.prepare(
    "SELECT * FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 20"
  ).all(new Date().toISOString()) as Array<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
  }>;

  let matchedRow: (typeof candidates)[0] | undefined;
  for (const candidate of candidates) {
    const matches = await bcrypt.compare(rawRefreshToken, candidate.token_hash);
    if (matches) {
      matchedRow = candidate;
      break;
    }
  }

  if (!matchedRow) {
    throw new AuthError("Invalid or expired refresh token.", "INVALID_REFRESH_TOKEN");
  }

  // Revoke the used refresh token (rotation)
  db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?")
    .run(new Date().toISOString(), matchedRow.id);

  const userRow = usersRepo.findSafeById(matchedRow.user_id);
  if (!userRow || userRow.status !== "ACTIVE") {
    throw new AuthError("Account is no longer active.", "ACCOUNT_INACTIVE");
  }

  const accessToken = issueAccessToken(userRow);
  const { raw: newRefreshToken, hash: newHash } = await generateRefreshToken();
  storeRefreshToken(userRow.id, newHash, REFRESH_DAYS);

  return { user: userRow, accessToken, newRefreshToken };
}

export function revokeAllUserTokens(userId: string): void {
  getDb().prepare(
    "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
  ).run(new Date().toISOString(), userId);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Ensure crypto is available for future CSRF token generation
export { crypto };
