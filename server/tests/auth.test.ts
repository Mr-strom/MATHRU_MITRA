/**
 * MaatruMitra — Auth service unit tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { login, issueAccessToken, verifyAccessToken } from "../services/auth.service.js";
import { AuthError } from "../services/errors.js";
import { seedTestUsers } from "./_setup.js";

describe("Auth service", () => {
  beforeEach(async () => {
    await seedTestUsers();
  });

  it("rejects login with wrong password", async () => {
    await expect(login("test.asha", "WrongPassword!")).rejects.toThrow(AuthError);
  });

  it("rejects login for unknown user", async () => {
    await expect(login("nobody.here", "AnyPassword!")).rejects.toThrow(AuthError);
  });

  it("issues and verifies an access token", async () => {
    const payload = {
      id: "test-asha-001",
      username: "test.asha",
      display_name: "Test ASHA_WORKER",
      role: "ASHA_WORKER" as const,
      assigned_area_id: "test-area-001",
      status: "ACTIVE" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const token = issueAccessToken(payload);
    expect(typeof token).toBe("string");
    const verified = verifyAccessToken(token);
    expect(verified.sub).toBe("test-asha-001");
    expect(verified.role).toBe("ASHA_WORKER");
  });

  it("verifyAccessToken throws on tampered token", () => {
    expect(() => verifyAccessToken("not.a.valid.token")).toThrow(AuthError);
  });

  it("login success returns accessToken, refreshToken, and safe user", async () => {
    const result = await login("test.asha", "TestPass123!");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.id).toBe("test-asha-001");
    expect(result.user).not.toHaveProperty("password_hash");
    expect(result.user).not.toHaveProperty("external_auth_id");
  });
});
