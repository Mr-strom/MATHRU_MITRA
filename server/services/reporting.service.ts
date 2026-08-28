/**
 * MaatruMitra — Operational Supervisor Reporting Service.
 *
 * SAFETY INVARIANTS:
 * - Scopes queries to actor's assigned area if specified.
 * - Restricts exported data to aggregated administrative metrics only.
 * - Never includes raw transcripts, audio URLs, or patient identifiers.
 */

import * as reportingRepo from "../repositories/reporting.repo.js";
import type { SafeUser } from "../repositories/users.repo.js";
import type { OperationalReportResponse } from "@shared/schemas.js";

const SAFETY_NOTICE =
  "Synthetic operational administrative metrics only. Clinical risk rankings, health outcome inferences, and individual worker profiling are strictly excluded.";

export async function getOperationalReport(actor: SafeUser): Promise<OperationalReportResponse> {
  const areaId = actor.assigned_area_id ?? undefined;

  const draftsAwaiting = reportingRepo.getDraftsAwaitingCount(areaId);
  const tasksSummary = reportingRepo.getTasksSummary(areaId);
  const syncReliability = reportingRepo.getSyncReliabilitySummary(areaId);
  const medianTurnaround = reportingRepo.getMedianTurnaroundMinutes(areaId);
  const areaBreakdown = reportingRepo.getAreaActivityBreakdown(areaId);
  const roleActivity = reportingRepo.getRoleActivityBreakdown(areaId);

  return {
    drafts_awaiting_review: draftsAwaiting,
    tasks_summary: tasksSummary,
    sync_reliability: syncReliability,
    median_turnaround_minutes: medianTurnaround,
    area_breakdown: areaBreakdown,
    role_activity: roleActivity,
    generated_at: new Date().toISOString(),
    safety_notice: SAFETY_NOTICE,
  };
}

export async function exportOperationalReport(
  actor: SafeUser,
  format: "csv" | "json"
): Promise<{ contentType: string; filename: string; content: string }> {
  const report = await getOperationalReport(actor);
  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return {
      contentType: "application/json",
      filename: `maatrumitra_operational_report_${dateStr}.json`,
      content: JSON.stringify(report, null, 2),
    };
  }

  // Build sanitized CSV
  const lines: string[] = [];
  lines.push("# MAATRUMITRA — OPERATIONAL SUPERVISOR REPORT");
  lines.push(`# Generated At: ${report.generated_at}`);
  lines.push(`# Safety Notice: ${SAFETY_NOTICE}`);
  lines.push("");

  // Summary KPI Section
  lines.push("--- KEY OPERATIONAL METRICS ---");
  lines.push("Metric,Value");
  lines.push(`Drafts Awaiting ANM Review,${report.drafts_awaiting_review}`);
  lines.push(
    `Median Decision Turnaround (Minutes),${report.median_turnaround_minutes !== null ? report.median_turnaround_minutes : "N/A"}`
  );
  lines.push("");

  // Tasks Section
  lines.push("--- CONFIRMED TASKS PIPELINE ---");
  lines.push("Status,Count");
  lines.push(`Open (Pending Acknowledgment),${report.tasks_summary.open}`);
  lines.push(`Acknowledged (In Progress),${report.tasks_summary.acknowledged}`);
  lines.push(`Completed,${report.tasks_summary.completed}`);
  lines.push(`Overdue (Past Administrative Due Date),${report.tasks_summary.overdue}`);
  lines.push(`Total Confirmed Tasks,${report.tasks_summary.total}`);
  lines.push("");

  // Sync Reliability Section
  lines.push("--- OFFLINE SYNC & CONCURRENCY HEALTH ---");
  lines.push("Category,Count");
  lines.push(`Total Synced Actions,${report.sync_reliability.total_synced_actions}`);
  lines.push(`Applied Successfully,${report.sync_reliability.applied}`);
  lines.push(`Concurrency Conflicts Detected,${report.sync_reliability.conflicts}`);
  lines.push(`Sync Failures / Rejections,${report.sync_reliability.failures}`);
  lines.push(`Conflicts Authoritatively Resolved,${report.sync_reliability.resolved_conflicts}`);
  lines.push("");

  // Area Breakdown Section
  lines.push("--- AREA ACTIVITY BREAKDOWN ---");
  lines.push("Area ID,District,Taluk,PHC Name,Ward/Village,Drafts Count,Tasks Count,Active Workers");
  for (const a of report.area_breakdown) {
    lines.push(
      `"${a.area_id}","${a.district}","${a.taluk}","${a.phc_name}","${a.ward_village_label}",${a.drafts_count},${a.tasks_count},${a.active_workers_count}`
    );
  }
  lines.push("");

  // Role Activity Section
  lines.push("--- ROLE ACTIVITY VOLUME ---");
  lines.push("Role,Actions Count");
  for (const r of report.role_activity) {
    lines.push(`"${r.role}",${r.actions_count}`);
  }

  return {
    contentType: "text/csv; charset=utf-8",
    filename: `maatrumitra_operational_report_${dateStr}.csv`,
    content: lines.join("\n"),
  };
}
