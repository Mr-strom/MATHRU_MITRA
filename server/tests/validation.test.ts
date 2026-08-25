/**
 * MaatruMitra — Request validation middleware tests.
 */

import { describe, it, expect } from "vitest";
import { LoginRequestSchema, CreateVoiceNoteSchema } from "@shared/schemas.js";

describe("LoginRequest schema", () => {
  it("accepts valid credentials", () => {
    const r = LoginRequestSchema.safeParse({ username: "test.asha", password: "TestPass123!" });
    expect(r.success).toBe(true);
  });

  it("rejects empty username", () => {
    const r = LoginRequestSchema.safeParse({ username: "", password: "TestPass123!" });
    expect(r.success).toBe(false);
  });

  it("rejects missing password", () => {
    const r = LoginRequestSchema.safeParse({ username: "test.asha" });
    expect(r.success).toBe(false);
  });
});

describe("CreateVoiceNote schema", () => {
  const validPayload = {
    beneficiary_reference_id: "ben-001",
    mime_type: "audio/webm",
    byte_size: 1024,
    consent_given: true as const,
  };

  it("accepts a valid voice note create request", () => {
    const r = CreateVoiceNoteSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
  });

  it("rejects consent_given: false", () => {
    const r = CreateVoiceNoteSchema.safeParse({ ...validPayload, consent_given: false });
    expect(r.success).toBe(false);
  });

  it("rejects missing beneficiary_reference_id", () => {
    const { beneficiary_reference_id, ...rest } = validPayload;
    const r = CreateVoiceNoteSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("defaults language_declared to kn", () => {
    const r = CreateVoiceNoteSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.language_declared).toBe("kn");
    }
  });

  it("rejects negative byte_size", () => {
    const r = CreateVoiceNoteSchema.safeParse({ ...validPayload, byte_size: -1 });
    expect(r.success).toBe(false);
  });
});
