/**
 * MaatruMitra — Users repository.
 * All database access for the users table goes through this module.
 */

import { getDb } from "./base.js";
import type { Role } from "@shared/roles.js";

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  assigned_area_id: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  password_hash: string | null;
  external_auth_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Safe user — never includes password_hash or external_auth_id. */
export type SafeUser = Omit<UserRow, "password_hash" | "external_auth_id">;

const SELECT_SAFE = `
  SELECT id, username, display_name, role, assigned_area_id,
         status, created_at, updated_at
  FROM users
`;

export function findById(id: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
}

export function findByUsername(username: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
}

export function findSafeById(id: string): SafeUser | undefined {
  return getDb()
    .prepare(`${SELECT_SAFE} WHERE id = ?`)
    .get(id) as SafeUser | undefined;
}

export function findByArea(areaId: string): SafeUser[] {
  return getDb()
    .prepare(`${SELECT_SAFE} WHERE assigned_area_id = ? AND status = 'ACTIVE'`)
    .all(areaId) as SafeUser[];
}

export function findByRole(role: Role): SafeUser[] {
  return getDb()
    .prepare(`${SELECT_SAFE} WHERE role = ? AND status = 'ACTIVE'`)
    .all(role) as SafeUser[];
}

export function findByRoleAndArea(role: Role, areaId: string): SafeUser[] {
  return getDb()
    .prepare(`${SELECT_SAFE} WHERE role = ? AND assigned_area_id = ? AND status = 'ACTIVE'`)
    .all(role, areaId) as SafeUser[];
}
