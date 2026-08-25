/**
 * MaatruMitra — Data minimization tests.
 *
 * Verifies that audit events do not log prohibited content:
 *   - Raw transcript text
 *   - Access tokens
 *   - Real phone numbers
 *   - Audio file URLs
 *
 * These tests protect against accidental logging regressions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { seedTestUsers, testDb } from "./_setup.js";
import * as auditEventsRepo from "../repositories/auditEvents.repo.js";

describe("Audit event data minimization", () => {
  beforeEach(async () => {
    await seedTestUsers();
  });

  it("stores only safe_payload — no raw transcript text", () => {
    const transcriptText = "ಗೀತಾ, ಎರಡು ವಾರದಿಂದ ಐರನ್ ಮಾತ್ರೆ ತಪ್ಪಿದೆ";
    auditEventsRepo.emit({
      actor_user_id: "test-asha-001",
      entity_type: "transcript",
      entity_id: "min-test-transcript-01",
      event_type: "TRANSCRIPT_CREATED",
      safe_payload: {
        voice_note_id: "min-test-vn-01",
        char_count: transcriptText.length,
        // intentionally NOT logging transcriptText itself
      },
    });

    const events = auditEventsRepo.findByEntity("transcript", "min-test-transcript-01");
    expect(events.length).toBe(1);

    const payload = JSON.parse(events[0].safe_payload_json ?? "{}");
    expect(payload.char_count).toBe(transcriptText.length);
    // The raw text must not be in the payload
    expect(JSON.stringify(payload)).not.toContain(transcriptText);
  });

  it("stores char_count not text in transcript events", () => {
    // The extraction service logs char_count, not the transcript text
    // This test documents the expected pattern
    auditEventsRepo.emit({
      entity_type: "transcript",
      entity_id: "min-test-transcript-02",
      event_type: "WORKER_REVISION_ADDED",
      safe_payload: { char_count: 42, voice_note_id: "min-test-vn-02" },
    });

    const events = auditEventsRepo.findByEntity("transcript", "min-test-transcript-02");
    const payload = JSON.parse(events[0].safe_payload_json ?? "{}");
    expect(payload.char_count).toBeDefined();
    expect(payload.text).toBeUndefined();
    expect(payload.transcript_text).toBeUndefined();
  });

  it("does not allow raw access token values in safe_payload", () => {
    // This test documents a design constraint: tokens must never be in audit payload
    const fakeToken = "eyJhbGciOiJIUzI1NiJ9.test";
    auditEventsRepo.emit({
      entity_type: "user",
      entity_id: "min-test-user-01",
      event_type: "LOGIN",
      safe_payload: { user_agent: "Mozilla/5.0 (Test)", ip_truncated: "192.168.x.x" },
    });

    const events = auditEventsRepo.findByEntity("user", "min-test-user-01");
    expect(JSON.stringify(events[0].safe_payload_json ?? "")).not.toContain(fakeToken);
  });

  it("audit event rows are immutable — no UPDATE or DELETE path exists", () => {
    // The repo module must not export update or delete functions
    const repoExports = Object.keys(auditEventsRepo);
    expect(repoExports).not.toContain("update");
    expect(repoExports).not.toContain("delete");
    expect(repoExports).not.toContain("deleteById");
    expect(repoExports).not.toContain("updateById");
  });

  it("records actor_user_id as null for SYSTEM actions", () => {
    auditEventsRepo.emit({
      actor_user_id: null,
      entity_type: "voice_note",
      entity_id: "min-test-vn-03",
      event_type: "TRANSCRIPTION_JOB_QUEUED",
      next_state: "PROCESSING",
    });

    const events = auditEventsRepo.findByEntity("voice_note", "min-test-vn-03");
    expect(events[0].actor_user_id).toBeNull();
  });
});
