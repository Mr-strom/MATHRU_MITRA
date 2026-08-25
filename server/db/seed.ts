/**
 * MaatruMitra — Development seed data.
 *
 * Creates synthetic users, areas, beneficiary references, SOP documents,
 * and one complete demo workflow fixture using visibly fictional identities.
 *
 * SAFETY: All names, references, and data are clearly demonstrative.
 * No real patient data. No real health credentials.
 *
 * Usage: pnpm db:seed
 *
 * Note: Uses positional ? parameters (node:sqlite does not support @named params).
 */

import { getDb, withTransaction } from "./client.js";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const db = getDb();

// ── Demo credentials (displayed in local setup guide) ────────────────────────
const DEMO_USERS = [
  {
    id: nanoid(),
    username: "asha.demo",
    display_name: "Asha Lakshmi (Demo Worker)",
    role: "ASHA_WORKER",
    password: "AshaDemoPass123!",
  },
  {
    id: nanoid(),
    username: "anm.demo",
    display_name: "ANM Priya Rao (Demo Reviewer)",
    role: "ANM_REVIEWER",
    password: "AnmDemoPass123!",
  },
  {
    id: nanoid(),
    username: "admin.demo",
    display_name: "PHC Admin Ramesh (Demo Admin)",
    role: "PHC_ADMIN",
    password: "AdminDemoPass123!",
  },
] as const;

async function seed() {
  console.log("Seeding development database with synthetic demo data…\n");

  // ── 1. Area ──────────────────────────────────────────────────────────────
  const areaId = nanoid();

  // ── 2. Users ─────────────────────────────────────────────────────────────
  const hashedUsers = await Promise.all(
    DEMO_USERS.map(async (u) => ({
      ...u,
      password_hash: await bcrypt.hash(u.password, 12),
      assigned_area_id: areaId,
    }))
  );

  // ── 3. Beneficiary reference ─────────────────────────────────────────────
  const benRefId = nanoid();
  const dataRetentionUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const consentCapturedAt = new Date().toISOString();

  // ── 4. SOP document ──────────────────────────────────────────────────────
  const sopDocId = nanoid();
  const adminUser = hashedUsers.find((u) => u.role === "PHC_ADMIN")!;

  // ── 5. SOP excerpts ───────────────────────────────────────────────────────
  const excerpt1Id = nanoid();
  const excerpt2Id = nanoid();

  withTransaction(() => {
    // Clear existing seed data to allow safe re-runs
    db.prepare("DELETE FROM sop_excerpts WHERE document_id IN (SELECT id FROM sop_documents WHERE version LIKE '%-demo%')").run();
    db.prepare("DELETE FROM sop_documents WHERE version LIKE '%-demo%'").run();
    db.prepare("DELETE FROM beneficiary_references WHERE external_reference_alias LIKE 'BEN-DEMO-%'").run();
    db.prepare("DELETE FROM users WHERE username LIKE '%.demo'").run();
    db.prepare("DELETE FROM areas WHERE ward_village_label = ? AND district = ?").run("Ward 03", "Chitradurga");

    // Insert area
    db.prepare(`
      INSERT INTO areas (id, district, taluk, phc_name, ward_village_label, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(areaId, "Chitradurga", "Hiriyur", "PHC Malladihalli", "Ward 03", 1);
    console.log(`  ✓ Area: Ward 03, Chitradurga`);

    // Insert users
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, display_name, role, assigned_area_id, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const u of hashedUsers) {
      insertUser.run(u.id, u.username, u.display_name, u.role, u.assigned_area_id, u.password_hash);
      console.log(`  ✓ User: ${u.username} (${u.role})`);
    }

    // Insert beneficiary reference
    db.prepare(`
      INSERT INTO beneficiary_references
        (id, external_reference_alias, area_id, consent_status, consent_captured_at, data_retention_until)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(benRefId, "BEN-DEMO-001", areaId, "GIVEN", consentCapturedAt, dataRetentionUntil);
    console.log(`  ✓ Beneficiary reference: BEN-DEMO-001`);

    // Insert SOP document
    db.prepare(`
      INSERT INTO sop_documents
        (id, title, version, effective_date, source_url_or_file_key, checksum,
         approval_status, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sopDocId,
      "Karnataka RMNCH+A Operational Guidelines — ASHA Field Follow-Up",
      "v2.1-demo",
      "2024-04-01",
      "demo/rmnch_a_guidelines_v2_1_demo.pdf",
      "DEMO_CHECKSUM_NOT_VERIFIED",
      "APPROVED",
      adminUser.id,
      "2024-04-01T00:00:00.000Z"
    );
    console.log(`  ✓ SOP document: Karnataka RMNCH+A Operational Guidelines — ASHA Field Follow-Up`);

    // Insert SOP excerpt 1
    db.prepare(`
      INSERT INTO sop_excerpts
        (id, document_id, section_label, page_reference, excerpt_text, tags, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      excerpt1Id, sopDocId,
      "Section 4.2 — Iron-Folic Acid (IFA) Supplement Routine", "p. 38",
      "When an ASHA worker reports an interruption in a beneficiary's IFA supplement routine, the ANM should be notified within two working days. The ANM's role is to verify the interruption, understand the reason, and schedule a home follow-up visit to reinstate the routine through counselling. No clinical escalation should be initiated on the basis of an administrative follow-up note alone. [DEMO — Illustrative only. Verify against current approved Karnataka RMNCH+A guidelines.]",
      JSON.stringify(["ifa", "supplement", "home-visit", "routine"]),
      1
    );
    console.log("  ✓ SOP excerpt: Section 4.2 — IFA Supplement Routine…");

    // Insert SOP excerpt 2
    db.prepare(`
      INSERT INTO sop_excerpts
        (id, document_id, section_label, page_reference, excerpt_text, tags, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      excerpt2Id, sopDocId,
      "Section 2.1 — Missed Home Visit Follow-Up", "p. 14",
      "If an expected home visit to a registered beneficiary is missed, the ASHA worker must record the reason and report to the ANM at the next scheduled outreach session. The ANM reviews the report and assigns the next contact attempt. Documentation of the missed visit and subsequent contact must be entered in the approved register. [DEMO — Illustrative only. Verify against current approved Karnataka RMNCH+A guidelines.]",
      JSON.stringify(["missed-visit", "home-visit", "outreach"]),
      1
    );
    console.log("  ✓ SOP excerpt: Section 2.1 — Missed Home Visit Follow-Up…");
  });

  console.log("\n─────────────────────────────────────────");
  console.log("Demo credentials (development only):");
  console.log("─────────────────────────────────────────");
  for (const u of DEMO_USERS) {
    console.log(`  ${u.role.padEnd(16)} ${u.username} / ${u.password}`);
  }
  console.log("─────────────────────────────────────────");
  console.log("\nSeed complete. These are fictional identities for demonstration purposes.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
