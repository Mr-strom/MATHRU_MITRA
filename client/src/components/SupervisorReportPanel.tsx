/**
 * MaatruMitra — PHC Admin Supervisor Operational Reporting Panel.
 *
 * SAFETY INVARIANTS:
 * - Displays purely operational throughput and synchronization reliability metrics.
 * - ZERO clinical risk rankings, zero patient health predictions, zero individual worker profiling.
 * - Role-gated and area-filtered.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Activity, Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Download, ShieldAlert, Layers, MapPin, Users, Zap, FileSpreadsheet, FileJson
} from "lucide-react";
import {
  admin,
  type OperationalReportResponse,
  ApiRequestError,
} from "../lib/api";

export function SupervisorReportPanel() {
  const [report, setReport] = useState<OperationalReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Pagination for area breakdown table
  const [areaPage, setAreaPage] = useState(1);
  const AREAS_PER_PAGE = 5;

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await admin.getOperationalReport();
      setReport(data);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setError(err.body.error);
      } else {
        setError("Failed to load operational metrics.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExport = async (format: "csv" | "json") => {
    setIsExporting(true);
    setExportNotice(null);
    try {
      await admin.downloadReportExport(format);
      setExportNotice(`Report exported successfully as ${format.toUpperCase()}.`);
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export report.");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="report-panel-loading" role="status" aria-live="polite">
        <RefreshCw size={24} className="spin" />
        <p>Loading operational supervisor metrics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-panel-error" role="alert">
        <AlertTriangle size={24} />
        <h4>Failed to Load Report</h4>
        <p>{error}</p>
        <button className="btn-secondary" onClick={loadReport} type="button">
          <RefreshCw size={13} /> Try Again
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="report-panel-empty">
        <p>No operational data available for this facility.</p>
        <button className="btn-secondary" onClick={loadReport} type="button">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    );
  }

  // Pagination calculations for area list
  const totalAreaPages = Math.max(1, Math.ceil(report.area_breakdown.length / AREAS_PER_PAGE));
  const displayedAreas = report.area_breakdown.slice(
    (areaPage - 1) * AREAS_PER_PAGE,
    areaPage * AREAS_PER_PAGE
  );

  return (
    <div className="report-container" role="region" aria-label="Supervisor Operational Reporting">
      {/* Header with Export Actions */}
      <div className="report-header">
        <div>
          <div className="report-title-badge">
            <Activity size={14} />
            <span>PHC SUPERVISOR OPERATIONAL INTELLIGENCE</span>
          </div>
          <h2 className="report-title">Facility Workflow &amp; Sync Summary</h2>
          <p className="report-subtitle">
            Generated: {new Date(report.generated_at).toLocaleString("en-IN")} • Data: Synthetic Demo Dataset
          </p>
        </div>

        <div className="report-header-actions">
          <button
            className="report-btn-secondary"
            onClick={loadReport}
            disabled={loading}
            type="button"
            aria-label="Refresh operational metrics"
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button
            className="report-btn-primary"
            onClick={() => handleExport("csv")}
            disabled={isExporting}
            type="button"
            aria-label="Export sanitized report in CSV format"
          >
            <FileSpreadsheet size={13} /> Export CSV
          </button>
          <button
            className="report-btn-secondary"
            onClick={() => handleExport("json")}
            disabled={isExporting}
            type="button"
            aria-label="Export sanitized report in JSON format"
          >
            <FileJson size={13} /> Export JSON
          </button>
        </div>
      </div>

      {/* Export notification */}
      {exportNotice && (
        <div className="report-alert report-alert-success" role="status">
          <CheckCircle2 size={14} />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Mandatory Safety & Governance Disclosure */}
      <div className="report-safety-banner" role="note">
        <ShieldAlert size={16} className="report-shield-icon" />
        <div>
          <strong>Operational Administrative Scope Only:</strong>
          <span> {report.safety_notice}</span>
        </div>
      </div>

      {/* 4 Primary KPI Cards Grid */}
      <div className="report-kpi-grid">
        {/* KPI 1: Draft Review Queue */}
        <div className="report-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Drafts Awaiting ANM Review</span>
            <div className="kpi-icon-pill icon-waiting">
              <Clock size={16} />
            </div>
          </div>
          <div className="kpi-value">{report.drafts_awaiting_review}</div>
          <p className="kpi-sub">Field drafts awaiting supervisory review &amp; task confirmation</p>
        </div>

        {/* KPI 2: Task Execution Pipeline & Overdue */}
        <div className="report-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Confirmed Follow-Up Tasks</span>
            <div className="kpi-icon-pill icon-tasks">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="kpi-value">{report.tasks_summary.total}</div>
          <div className="kpi-stat-chips">
            <span className="chip chip-open">Open: {report.tasks_summary.open}</span>
            <span className="chip chip-ack">Ack: {report.tasks_summary.acknowledged}</span>
            <span className="chip chip-done">Done: {report.tasks_summary.completed}</span>
            {report.tasks_summary.overdue > 0 ? (
              <span className="chip chip-overdue" role="alert">
                <AlertTriangle size={10} /> Overdue: {report.tasks_summary.overdue}
              </span>
            ) : (
              <span className="chip chip-ontime">0 Overdue</span>
            )}
          </div>
        </div>

        {/* KPI 3: Median Decision Turnaround */}
        <div className="report-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Median Decision Turnaround</span>
            <div className="kpi-icon-pill icon-turnaround">
              <Zap size={16} />
            </div>
          </div>
          <div className="kpi-value">
            {report.median_turnaround_minutes !== null
              ? `${report.median_turnaround_minutes}m`
              : "—"}
          </div>
          <p className="kpi-sub">
            {report.median_turnaround_minutes !== null
              ? "Median minutes from ASHA draft submission to ANM confirmation"
              : "Awaiting completed supervisory decisions to compute median"}
          </p>
        </div>

        {/* KPI 4: Offline Sync & OCC Health */}
        <div className="report-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Offline Sync &amp; OCC Health</span>
            <div className="kpi-icon-pill icon-sync">
              <Layers size={16} />
            </div>
          </div>
          <div className="kpi-value">{report.sync_reliability.total_synced_actions}</div>
          <div className="kpi-stat-chips">
            <span className="chip chip-applied">Applied: {report.sync_reliability.applied}</span>
            <span className="chip chip-conflict">Conflicts: {report.sync_reliability.conflicts}</span>
            <span className="chip chip-resolved">Resolved: {report.sync_reliability.resolved_conflicts}</span>
            {report.sync_reliability.failures > 0 && (
              <span className="chip chip-failed">Failures: {report.sync_reliability.failures}</span>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown Section: Area Activity & Role Activity */}
      <div className="report-breakdowns-grid">
        {/* Table 1: Area Activity Breakdown */}
        <div className="report-card-section">
          <div className="section-head">
            <div className="section-title">
              <MapPin size={15} />
              <h3>Area Operational Volume ({report.area_breakdown.length})</h3>
            </div>
            {totalAreaPages > 1 && (
              <div className="section-pagination">
                <button
                  onClick={() => setAreaPage((p) => Math.max(1, p - 1))}
                  disabled={areaPage === 1}
                  className="page-btn"
                  type="button"
                >
                  Prev
                </button>
                <span>{areaPage} / {totalAreaPages}</span>
                <button
                  onClick={() => setAreaPage((p) => Math.min(totalAreaPages, p + 1))}
                  disabled={areaPage === totalAreaPages}
                  className="page-btn"
                  type="button"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {report.area_breakdown.length === 0 ? (
            <p className="table-empty">No area records available.</p>
          ) : (
            <div className="table-responsive">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Ward / Village</th>
                    <th>PHC / Taluk</th>
                    <th>Drafts</th>
                    <th>Tasks</th>
                    <th>Active Workers</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedAreas.map((area) => (
                    <tr key={area.area_id}>
                      <td><strong>{area.ward_village_label}</strong></td>
                      <td>{area.phc_name} • {area.taluk}</td>
                      <td><span className="num-pill">{area.drafts_count}</span></td>
                      <td><span className="num-pill">{area.tasks_count}</span></td>
                      <td><span className="num-pill worker-pill">{area.active_workers_count}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Table 2: Role Activity Volume */}
        <div className="report-card-section">
          <div className="section-head">
            <div className="section-title">
              <Users size={15} />
              <h3>Audit Volume by Role</h3>
            </div>
          </div>

          <div className="role-activity-list">
            {report.role_activity.map((r) => (
              <div key={r.role} className="role-activity-item">
                <div className="role-meta">
                  <span className="role-name">{r.role.replace("_", " ")}</span>
                  <span className="role-count">{r.actions_count} logged actions</span>
                </div>
                <div className="role-progress-bar">
                  <div
                    className="role-progress-fill"
                    style={{
                      width: `${Math.min(100, Math.max(8, (r.actions_count / (Math.max(1, ...report.role_activity.map((x) => x.actions_count))) * 100)))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
