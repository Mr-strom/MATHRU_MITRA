/**
 * MaatruMitra — Operational Supervisor Reporting Repository.
 *
 * SAFETY INVARIANTS:
 * - Computes safe system aggregates (drafts, tasks, sync health, median turnaround, area/role volumes).
 * - Zero clinical risk ranking, zero patient diagnostic grouping, zero worker scoring.
 * - Area-scoped filtering when requested.
 */

import { getDb } from "./base.js";
import type {
  TasksSummary,
  SyncReliabilitySummary,
  AreaBreakdownItem,
  RoleActivityItem,
} from "@shared/schemas.js";

export function getDraftsAwaitingCount(areaId?: string): number {
  const db = getDb();
  if (areaId) {
    const row = db
      .prepare(`
        SELECT COUNT(*) as cnt
        FROM follow_up_drafts d
        JOIN voice_notes vn ON vn.id = d.voice_note_id
        JOIN beneficiary_references br ON br.id = vn.beneficiary_reference_id
        WHERE d.state = 'AWAITING_ANM_REVIEW' AND br.area_id = ?
      `)
      .get(areaId) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  const row = db
    .prepare(`
      SELECT COUNT(*) as cnt
      FROM follow_up_drafts
      WHERE state = 'AWAITING_ANM_REVIEW'
    `)
    .get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function getTasksSummary(areaId?: string): TasksSummary {
  const db = getDb();
  const now = new Date().toISOString();

  let query = `
    SELECT
      COALESCE(SUM(CASE WHEN t.status = 'TASK_OPEN' THEN 1 ELSE 0 END), 0) as open_count,
      COALESCE(SUM(CASE WHEN t.status = 'TASK_ACKNOWLEDGED' THEN 1 ELSE 0 END), 0) as ack_count,
      COALESCE(SUM(CASE WHEN t.status = 'TASK_COMPLETED' THEN 1 ELSE 0 END), 0) as completed_count,
      COALESCE(SUM(CASE WHEN (t.status = 'TASK_OPEN' OR t.status = 'TASK_ACKNOWLEDGED') AND t.due_at < ? THEN 1 ELSE 0 END), 0) as overdue_count,
      COUNT(t.id) as total_count
    FROM follow_up_tasks t
    JOIN follow_up_drafts d ON d.id = t.draft_id
    JOIN voice_notes vn ON vn.id = d.voice_note_id
    JOIN beneficiary_references br ON br.id = vn.beneficiary_reference_id
  `;

  let row: any;
  if (areaId) {
    query += ` WHERE br.area_id = ?`;
    row = db.prepare(query).get(now, areaId);
  } else {
    row = db.prepare(query).get(now);
  }

  return {
    open: Number(row?.open_count ?? 0),
    acknowledged: Number(row?.ack_count ?? 0),
    completed: Number(row?.completed_count ?? 0),
    overdue: Number(row?.overdue_count ?? 0),
    total: Number(row?.total_count ?? 0),
  };
}

export function getSyncReliabilitySummary(areaId?: string): SyncReliabilitySummary {
  const db = getDb();

  let syncQuery = `
    SELECT
      COUNT(s.action_id) as total_actions,
      COALESCE(SUM(CASE WHEN s.result = 'APPLIED' OR s.result = 'ALREADY_APPLIED' THEN 1 ELSE 0 END), 0) as applied_count,
      COALESCE(SUM(CASE WHEN s.result = 'CONFLICT' THEN 1 ELSE 0 END), 0) as conflict_count,
      COALESCE(SUM(CASE WHEN s.result = 'REJECTED' THEN 1 ELSE 0 END), 0) as rejected_count
    FROM sync_actions s
    LEFT JOIN users u ON u.id = s.actor_user_id
  `;

  let resolvedQuery = `
    SELECT COUNT(a.id) as resolved_count
    FROM audit_events a
    LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.event_type = 'CONFLICT_RESOLVED'
  `;

  let syncRow: any;
  let resolvedRow: any;

  if (areaId) {
    syncQuery += ` WHERE u.assigned_area_id = ?`;
    resolvedQuery += ` AND u.assigned_area_id = ?`;
    syncRow = db.prepare(syncQuery).get(areaId);
    resolvedRow = db.prepare(resolvedQuery).get(areaId);
  } else {
    syncRow = db.prepare(syncQuery).get();
    resolvedRow = db.prepare(resolvedQuery).get();
  }

  return {
    total_synced_actions: Number(syncRow?.total_actions ?? 0),
    applied: Number(syncRow?.applied_count ?? 0),
    conflicts: Number(syncRow?.conflict_count ?? 0),
    failures: Number(syncRow?.rejected_count ?? 0),
    resolved_conflicts: Number(resolvedRow?.resolved_count ?? 0),
  };
}

export function getMedianTurnaroundMinutes(areaId?: string): number | null {
  const db = getDb();

  let query = `
    SELECT
      (julianday(decision.created_at) - julianday(submission.created_at)) * 24 * 60 AS duration_minutes
    FROM audit_events submission
    JOIN audit_events decision ON decision.entity_id = submission.entity_id
    JOIN follow_up_drafts d ON d.id = submission.entity_id
    JOIN voice_notes vn ON vn.id = d.voice_note_id
    JOIN beneficiary_references br ON br.id = vn.beneficiary_reference_id
    WHERE submission.event_type = 'DRAFT_SUBMITTED_FOR_REVIEW'
      AND decision.event_type IN ('DRAFT_CONFIRMED', 'DRAFT_REVISED', 'DRAFT_DISMISSED')
  `;

  let rows: Array<{ duration_minutes: number }>;
  if (areaId) {
    query += ` AND br.area_id = ?`;
    rows = db.prepare(query).all(areaId) as Array<{ duration_minutes: number }>;
  } else {
    rows = db.prepare(query).all() as Array<{ duration_minutes: number }>;
  }

  if (!rows || rows.length === 0) return null;

  const durations = rows
    .map((r) => Math.max(0, Math.round(r.duration_minutes)))
    .sort((a, b) => a - b);

  const mid = Math.floor(durations.length / 2);
  if (durations.length % 2 !== 0) {
    return durations[mid];
  }
  return Math.round((durations[mid - 1] + durations[mid]) / 2);
}

export function getAreaActivityBreakdown(areaId?: string): AreaBreakdownItem[] {
  const db = getDb();

  let query = `
    SELECT
      a.id as area_id,
      a.district,
      a.taluk,
      a.phc_name,
      a.ward_village_label,
      COUNT(DISTINCT d.id) as drafts_count,
      COUNT(DISTINCT t.id) as tasks_count,
      COUNT(DISTINCT u.id) as active_workers_count
    FROM areas a
    LEFT JOIN beneficiary_references br ON br.area_id = a.id
    LEFT JOIN voice_notes vn ON vn.beneficiary_reference_id = br.id
    LEFT JOIN follow_up_drafts d ON d.voice_note_id = vn.id
    LEFT JOIN follow_up_tasks t ON t.draft_id = d.id
    LEFT JOIN users u ON u.assigned_area_id = a.id
  `;

  let rows: any[];
  if (areaId) {
    query += ` WHERE a.id = ? GROUP BY a.id ORDER BY drafts_count DESC`;
    rows = db.prepare(query).all(areaId);
  } else {
    query += ` GROUP BY a.id ORDER BY drafts_count DESC`;
    rows = db.prepare(query).all();
  }

  return rows.map((r) => ({
    area_id: String(r.area_id),
    district: String(r.district),
    taluk: String(r.taluk),
    phc_name: String(r.phc_name),
    ward_village_label: String(r.ward_village_label),
    drafts_count: Number(r.drafts_count ?? 0),
    tasks_count: Number(r.tasks_count ?? 0),
    active_workers_count: Number(r.active_workers_count ?? 0),
  }));
}

export function getRoleActivityBreakdown(areaId?: string): RoleActivityItem[] {
  const db = getDb();

  let query = `
    SELECT
      u.role,
      COUNT(a.id) as actions_count
    FROM audit_events a
    JOIN users u ON u.id = a.actor_user_id
  `;

  let rows: any[];
  if (areaId) {
    query += ` WHERE u.assigned_area_id = ? GROUP BY u.role ORDER BY actions_count DESC`;
    rows = db.prepare(query).all(areaId);
  } else {
    query += ` GROUP BY u.role ORDER BY actions_count DESC`;
    rows = db.prepare(query).all();
  }

  // Guarantee standard roles exist even if 0 actions
  const roleMap = new Map<string, number>([
    ["ASHA_WORKER", 0],
    ["ANM_REVIEWER", 0],
    ["PHC_ADMIN", 0],
  ]);

  for (const r of rows) {
    if (r.role) roleMap.set(r.role, Number(r.actions_count ?? 0));
  }

  return Array.from(roleMap.entries()).map(([role, actions_count]) => ({
    role,
    actions_count,
  }));
}
