/**
 * MaatruMitra — Demo Reset & Diagnostics Integration Tests.
 *
 * Tests:
 * 1. POST /api/v1/admin/demo-reset requires authentication (401).
 * 2. POST /api/v1/admin/demo-reset rejects non-admin roles (ASHA: 403, ANM: 403).
 * 3. POST /api/v1/admin/demo-reset is blocked in production mode (409 PolicyError DEV_ONLY).
 * 4. POST /api/v1/admin/demo-reset resets DB fixtures and storage when authorized in dev.
 * 5. GET /api/v1/demo/readiness returns readiness diagnostics for authenticated users.
 * 6. X-Request-Id header is propagated and attached to error responses.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { seedTestUsers, seedTestSop } from "./_setup.js";
import { issueAccessToken } from "../services/auth.service.js";

const app = createApp();

function getAuthHeader(userId: string, username: string, role: "ASHA_WORKER" | "ANM_REVIEWER" | "PHC_ADMIN", areaId: string | null) {
  const token = issueAccessToken({
    id: userId,
    username,
    display_name: `Test ${role}`,
    role,
    assigned_area_id: areaId,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return `Bearer ${token}`;
}

describe("Demo Reset & Reliability Endpoints", () => {
  let ashaAuth: string;
  let anmAuth: string;
  let adminAuth: string;

  beforeEach(async () => {
    await seedTestUsers();
    seedTestSop();

    ashaAuth = getAuthHeader("test-asha-001", "test.asha", "ASHA_WORKER", "test-area-001");
    anmAuth = getAuthHeader("test-anm-001", "test.anm", "ANM_REVIEWER", "test-area-001");
    adminAuth = getAuthHeader("test-admin-001", "test.admin", "PHC_ADMIN", "test-area-001");
  });

  it("rejects unauthenticated requests to demo-reset", async () => {
    const res = await request(app).post("/api/v1/admin/demo-reset");
    expect(res.status).toBe(401);
    expect(res.body.request_id).toBeDefined();
  });

  it("rejects non-PHC_ADMIN roles from demo-reset", async () => {
    const ashaRes = await request(app)
      .post("/api/v1/admin/demo-reset")
      .set("Authorization", ashaAuth);
    expect(ashaRes.status).toBe(403);

    const anmRes = await request(app)
      .post("/api/v1/admin/demo-reset")
      .set("Authorization", anmAuth);
    expect(anmRes.status).toBe(403);
  });

  it("blocks demo-reset when NODE_ENV is production", async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const res = await request(app)
        .post("/api/v1/admin/demo-reset")
        .set("Authorization", adminAuth);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DEV_ONLY");
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("executes demo-reset successfully for PHC_ADMIN in development", async () => {
    const res = await request(app)
      .post("/api/v1/admin/demo-reset")
      .set("Authorization", adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notice).toContain("PROTOTYPE");
  });

  it("returns system readiness diagnostic on GET /api/v1/demo/readiness", async () => {
    const res = await request(app)
      .get("/api/v1/demo/readiness")
      .set("Authorization", ashaAuth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.database_schema).toBe("ready");
    expect(res.body.checks.synthetic_fixture).toBe("ready");
    expect(res.body.checks.messaging_safety).toContain("DISABLED");
  });

  it("propagates client X-Request-Id header or generates a clean one", async () => {
    const customId = "req_custom_trace_999";
    const res = await request(app)
      .get("/api/v1/me")
      .set("Authorization", ashaAuth)
      .set("X-Request-Id", customId);
    expect(res.headers["x-request-id"]).toBe(customId);
  });

  it("attaches request_id to safe error responses", async () => {
    const res = await request(app)
      .get("/api/v1/follow-up-drafts/non-existent-id")
      .set("Authorization", ashaAuth);
    expect(res.status).toBe(404);
    expect(res.body.request_id).toBeDefined();
    expect(typeof res.body.request_id).toBe("string");
  });
});
