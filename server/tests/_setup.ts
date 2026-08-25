/**
 * MaatruMitra — Test setup.
 * Uses Node 24's built-in node:sqlite with an in-memory database.
 * Mocks server/db/client.ts before any repository imports.
 */

import { beforeAll, afterAll, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── In-memory test DB ─────────────────────────────────────────────────────────
const testDb = new DatabaseSync(":memory:");
testDb.exec("PRAGMA journal_mode = WAL");
testDb.exec("PRAGMA foreign_keys = ON");

// ── Mock DB client before any other imports use it ────────────────────────────
vi.mock("../db/client.js", () => ({
  getDb: () => testDb,
  closeDb: () => {},
  withTransaction: <T>(fn: () => T): T => {
    const sp = `sp_test_${Math.random().toString(36).slice(2)}`;
    testDb.exec(`SAVEPOINT ${sp}`);
    try {
      const r = fn();
      testDb.exec(`RELEASE ${sp}`);
      return r;
    } catch (err) {
      testDb.exec(`ROLLBACK TO ${sp}`);
      throw err;
    }
  },
}));

// ── Environment ───────────────────────────────────────────────────────────────
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-not-for-production";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-not-for-production";
process.env.EXTRACTION_PROVIDER = "fake";
process.env.UPLOAD_DIR = "./tmp/maatrumitra-test-uploads";

// ── Migration runner ──────────────────────────────────────────────────────────
const MIGRATIONS_DIR = path.resolve(__dirname, "../db/migrations");

function applyMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    testDb.exec(sql);
  }
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

export async function seedTestUsers() {
  const areaId = "test-area-001";
  testDb.prepare(`
    INSERT OR IGNORE INTO areas (id, district, taluk, phc_name, ward_village_label)
    VALUES (?, 'TestDistrict', 'TestTaluk', 'TestPHC', 'Ward 01')
  `).run(areaId);

  const hash = await bcrypt.hash("TestPass123!", 10);
  const users = [
    { id: "test-asha-001", username: "test.asha", role: "ASHA_WORKER", area: areaId },
    { id: "test-anm-001", username: "test.anm", role: "ANM_REVIEWER", area: areaId },
    { id: "test-admin-001", username: "test.admin", role: "PHC_ADMIN", area: areaId },
  ];

  for (const u of users) {
    testDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, role, assigned_area_id, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(u.id, u.username, `Test ${u.role}`, u.role, u.area, hash);
  }

  testDb.prepare(`
    INSERT OR IGNORE INTO beneficiary_references
      (id, external_reference_alias, area_id, consent_status, consent_captured_at)
    VALUES ('test-ben-001', 'BEN-TEST-001', ?, 'GIVEN', datetime('now'))
  `).run(areaId);

  return { areaId, hash };
}

export function seedTestSop() {
  const docId = "test-sop-doc-001";
  const excerptId = "test-sop-exc-001";

  testDb.prepare(`
    INSERT OR IGNORE INTO sop_documents
      (id, title, version, effective_date, approval_status)
    VALUES (?, 'Test SOP', 'v1-test', '2024-01-01', 'APPROVED')
  `).run(docId);

  testDb.prepare(`
    INSERT OR IGNORE INTO sop_excerpts
      (id, document_id, section_label, page_reference, excerpt_text, tags)
    VALUES (?, ?, 'Section 1', 'p.1', 'Test excerpt for IFA supplement routine.', '["ifa","supplement"]')
  `).run(excerptId, docId);

  return { docId, excerptId };
}

beforeAll(() => {
  applyMigrations();
});

afterAll(() => {
  testDb.close();
});

export { testDb };
