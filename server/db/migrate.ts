/**
 * MaatruMitra — Database migration runner.
 * Uses Node 24's built-in node:sqlite.
 * Reads .sql files from server/db/migrations/ in lexicographic order.
 * Skips already-applied migrations using the schema_migrations table.
 *
 * Usage: pnpm db:migrate
 *        pnpm db:migrate --reset   (drops all tables and reruns from scratch — dev only)
 */

import { getDb } from "./client.js";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicographic order ensures 001 before 002
}

export function getAppliedVersions(db: DatabaseSync): Set<string> {
  try {
    const rows = db
      .prepare("SELECT version FROM schema_migrations")
      .all() as { version: string }[];
    return new Set(rows.map((r) => r.version));
  } catch {
    // schema_migrations doesn't exist yet — will be created by 001
    return new Set();
  }
}

export function checkSchemaReady(db: DatabaseSync): boolean {
  try {
    const applied = getAppliedVersions(db);
    const files = getMigrationFiles();
    return files.length > 0 && files.every((f) => applied.has(path.basename(f, ".sql")));
  } catch {
    return false;
  }
}

export function dropAllTables(db: DatabaseSync): void {
  console.warn("⚠️  RESET mode: dropping all tables (dev only)");
  db.exec("PRAGMA foreign_keys = OFF");
  const tables = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
  ).map((r) => r.name);
  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS "${table}"`);
  }
  db.exec("PRAGMA foreign_keys = ON");
}

export async function runMigrations(options: { reset?: boolean; silent?: boolean } = {}): Promise<number> {
  const isReset = options.reset ?? false;
  const db = getDb();

  if (isReset) {
    dropAllTables(db);
  }

  const files = getMigrationFiles();
  const applied = getAppliedVersions(db);

  let ran = 0;
  for (const file of files) {
    const version = path.basename(file, ".sql");
    if (applied.has(version)) {
      if (!options.silent) console.log(`  ✓ ${version} already applied`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    if (!options.silent) console.log(`  → Applying ${version} …`);

    // Run migration and record it in a savepoint (node:sqlite transaction)
    db.exec(`SAVEPOINT mig_${version.replace(/\W/g, "_")}`);
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      db.exec(`RELEASE mig_${version.replace(/\W/g, "_")}`);
    } catch (err) {
      db.exec(`ROLLBACK TO mig_${version.replace(/\W/g, "_")}`);
      throw err;
    }

    if (!options.silent) console.log(`  ✓ ${version} applied`);
    ran++;
  }

  if (!options.silent) {
    console.log(
      ran > 0
        ? `\nMigrations complete: ${ran} applied.`
        : "\nNo new migrations to apply."
    );
  }
  return ran;
}

// Auto-run if executed directly via CLI
if (process.argv[1] && (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"))) {
  runMigrations({ reset: process.argv.includes("--reset") }).catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
