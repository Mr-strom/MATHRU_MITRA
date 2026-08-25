/**
 * MaatruMitra — Base repository types and helpers.
 * All entity repositories use this module for type safety.
 */

import { getDb } from "../db/client.js";

export type DbRow = Record<string, unknown>;

/** Convert SQLite integer booleans (0/1) to real booleans. */
export function rowToBoolean(value: unknown): boolean {
  return value === 1 || value === true;
}

/** Parse a JSON column safely, returning a fallback on failure. */
export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export { getDb };
