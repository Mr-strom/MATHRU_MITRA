/**
 * MaatruMitra — Follow-up tasks repository.
 */

import { getDb } from "./base.js";
import { nanoid } from "nanoid";
import type { TaskState } from "@shared/states.js";

export interface TaskRow {
  id: string;
  draft_id: string;
  status: TaskState;
  owner_user_id: string;
  due_at: string;
  reviewer_user_id: string;
  reviewer_note: string | null;
  confirmed_at: string;
  completed_at: string | null;
  completion_note: string | null;
  server_version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  draft_id: string;
  owner_user_id: string;
  due_at: string;
  reviewer_user_id: string;
  reviewer_note?: string;
  confirmed_at: string;
}

export function create(input: CreateTaskInput): TaskRow {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO follow_up_tasks
      (id, draft_id, status, owner_user_id, due_at, reviewer_user_id,
       reviewer_note, confirmed_at, server_version, created_at, updated_at)
    VALUES (?, ?, 'TASK_OPEN', ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, input.draft_id, input.owner_user_id, input.due_at, input.reviewer_user_id,
    input.reviewer_note ?? null, input.confirmed_at, now, now
  );
  return findById(id)!;
}

export function findById(id: string): TaskRow | undefined {
  return getDb()
    .prepare("SELECT * FROM follow_up_tasks WHERE id = ?")
    .get(id) as TaskRow | undefined;
}

export function findByDraft(draftId: string): TaskRow | undefined {
  return getDb()
    .prepare("SELECT * FROM follow_up_tasks WHERE draft_id = ? LIMIT 1")
    .get(draftId) as TaskRow | undefined;
}

export function findByOwner(ownerId: string, status?: TaskState, cursor?: string, limit = 20): TaskRow[] {
  const conditions: string[] = ["owner_user_id = ?"];
  const params: (string | number)[] = [ownerId];
  if (status) { conditions.push("status = ?"); params.push(status); }
  if (cursor) { conditions.push("created_at < ?"); params.push(cursor); }
  params.push(limit);
  return getDb().prepare(
    `SELECT * FROM follow_up_tasks WHERE ${conditions.join(" AND ")} ORDER BY due_at ASC LIMIT ?`
  ).all(...params) as TaskRow[];
}

export function findByArea(areaId: string, status?: TaskState, cursor?: string, limit = 20): TaskRow[] {
  const params: (string | number)[] = [areaId];
  let statusClause = "";
  if (status) { statusClause = "AND t.status = ?"; params.push(status); }
  if (cursor) params.push(cursor);
  params.push(limit);
  return getDb().prepare(`
    SELECT t.* FROM follow_up_tasks t
    JOIN follow_up_drafts fd ON fd.id = t.draft_id
    JOIN voice_notes vn ON vn.id = fd.voice_note_id
    JOIN beneficiary_references br ON br.id = vn.beneficiary_reference_id
    WHERE br.area_id = ? ${statusClause}
      ${cursor ? "AND t.created_at < ?" : ""}
    ORDER BY t.due_at ASC LIMIT ?
  `).all(...params) as TaskRow[];
}

export function updateStatus(
  id: string,
  status: TaskState,
  extra?: { completed_at?: string; completion_note?: string }
): void {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE follow_up_tasks
    SET status = ?, completed_at = ?, completion_note = ?, server_version = server_version + 1, updated_at = ?
    WHERE id = ?
  `).run(
    status,
    extra?.completed_at ?? null,
    extra?.completion_note ?? null,
    now,
    id,
  );
}

export function updateFields(
  id: string,
  fields: Partial<Pick<TaskRow, "owner_user_id" | "due_at" | "reviewer_note">>
): void {
  const now = new Date().toISOString();
  const allowed = ["owner_user_id", "due_at", "reviewer_note"] as const;
  const sets = allowed.filter((k) => k in fields).map((k) => `${k} = ?`).join(", ");
  const values = allowed.filter((k) => k in fields).map((k) => fields[k] ?? null);
  if (sets.length > 0) {
    getDb().prepare(
      `UPDATE follow_up_tasks SET server_version = server_version + 1, updated_at = ?, ${sets} WHERE id = ?`
    ).run(now, ...values, id);
  }
}
