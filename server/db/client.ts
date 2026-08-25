/**
 * MaatruMitra — SQLite database client.
 *
 * Uses Node 24's built-in `node:sqlite` (DatabaseSync) — no native compilation,
 * no external dependencies. The API is intentionally compatible with better-sqlite3
 * so repositories require zero changes.
 *
 * DATABASE_URL: path to SQLite file (default: ./dev.sqlite)
 * For PostgreSQL (production): swap this module for a pg-based adapter.
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbUrl = process.env.DATABASE_URL ?? "./dev.sqlite";

const dbPath = path.isAbsolute(dbUrl)
  ? dbUrl
  : path.resolve(process.cwd(), dbUrl);

// Use ":memory:" for tests (set via DATABASE_URL in test setup)
const resolvedPath = dbPath === ":memory:" ? ":memory:" : dbPath;

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(resolvedPath);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    _db.exec("PRAGMA busy_timeout = 5000");
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Run a function inside a SQLite transaction. */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  // node:sqlite does not expose a transaction() helper like better-sqlite3.
  // We use manual SAVEPOINT for nested-transaction safety.
  const savepoint = `sp_${Math.random().toString(36).slice(2)}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = fn();
    db.exec(`RELEASE ${savepoint}`);
    return result;
  } catch (err) {
    db.exec(`ROLLBACK TO ${savepoint}`);
    throw err;
  }
}
