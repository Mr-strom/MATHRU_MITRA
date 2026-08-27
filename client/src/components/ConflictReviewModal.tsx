/**
 * MaatruMitra — Conflict Review Modal Component.
 *
 * ACCESSIBLE & NON-COLOR-DEPENDENT:
 * - Side-by-side comparison of Local vs Server states.
 * - Displays timestamps, version numbers, and actor roles.
 * - Enforces role-based action controls (e.g., ASHA cannot overwrite ANM decisions).
 * - Preserves non-diagnostic administrative boundary.
 */

import { useState } from "react";
import {
  AlertTriangle, ShieldAlert, CheckCircle2, ArrowRight,
  X, Check, RefreshCw, FileText, User, Clock, AlertCircle
} from "lucide-react";
import type { QueuedAction } from "../lib/offlineQueue";

interface ConflictReviewModalProps {
  action: QueuedAction;
  userRole: string;
  onClose: () => void;
  onResolve: (
    actionId: string,
    resolutionStrategy: "KEEP_SERVER" | "KEEP_LOCAL" | "MANUAL_MERGE",
    resolvedFields?: Record<string, unknown>,
    reason?: string
  ) => Promise<void>;
}

export function ConflictReviewModal({
  action,
  userRole,
  onClose,
  onResolve,
}: ConflictReviewModalProps) {
  const [strategy, setStrategy] = useState<"KEEP_SERVER" | "KEEP_LOCAL" | "MANUAL_MERGE">("KEEP_SERVER");
  const [resolutionReason, setResolutionReason] = useState("Reconciled through conflict review");
  const [mergedSummary, setMergedSummary] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverEntity = (action.authoritative_entity ?? {}) as Record<string, unknown>;
  const localPayload = action.payload ?? {};

  // Extract server state attributes
  const serverState = String(serverEntity.state ?? serverEntity.status ?? "UNKNOWN");
  const serverVersion = Number(serverEntity.server_version ?? 1);
  const serverSummary = String(serverEntity.summary ?? serverEntity.worker_observation_summary ?? "—");
  const serverUpdatedAt = serverEntity.updated_at ? new Date(String(serverEntity.updated_at)).toLocaleString("en-IN") : "—";
  const serverOwner = String(serverEntity.owner_user_id ?? serverEntity.proposed_owner_user_id ?? "—");
  const serverDueAt = serverEntity.due_at || serverEntity.proposed_due_at
    ? new Date(String(serverEntity.due_at ?? serverEntity.proposed_due_at)).toLocaleDateString("en-IN")
    : "—";

  // Extract local attributes
  const localSummary = String(localPayload.text ?? localPayload.summary ?? localPayload.worker_observation_summary ?? "—");
  const localCreatedAt = new Date(action.created_at).toLocaleString("en-IN");
  const localBaseVersion = action.base_server_version ?? 1;

  // Authorization checks
  const isAnmDecisionLocked =
    userRole === "ASHA_WORKER" && ["CONFIRMED", "REVISED", "DISMISSED"].includes(serverState);

  const canOverwrite = !isAnmDecisionLocked;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      let resolvedFields: Record<string, unknown> | undefined = undefined;

      if (strategy === "KEEP_LOCAL") {
        resolvedFields = {
          summary: localSummary !== "—" ? localSummary : undefined,
        };
      } else if (strategy === "MANUAL_MERGE") {
        resolvedFields = {
          summary: mergedSummary.trim() || serverSummary,
        };
      }

      await onResolve(action.action_id, strategy, resolvedFields, resolutionReason);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve conflict.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="conflict-modal-title">
      <div className="modal-content conflict-modal-card">
        {/* Header */}
        <div className="conflict-modal-header">
          <div className="conflict-title-group">
            <ShieldAlert size={20} className="conflict-icon-warn" />
            <div>
              <h3 id="conflict-modal-title">Conflict Review &amp; Resolution</h3>
              <p className="conflict-sub">
                Entity: <code>{action.entity_type}</code> • Code: <strong>{action.conflict_code ?? "STALE_BASE_VERSION"}</strong>
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal" type="button">
            <X size={18} />
          </button>
        </div>

        {/* Permission Warning if ASHA cannot overwrite ANM */}
        {isAnmDecisionLocked && (
          <div className="conflict-banner-locked" role="alert">
            <AlertCircle size={16} />
            <div>
              <strong>Supervisory Decision Locked</strong>: The server version was already decided by an ANM/PHC Admin ({serverState}). ASHA workers cannot overwrite confirmed supervisory actions. You may accept the server version.
            </div>
          </div>
        )}

        {/* Side-by-Side Comparison */}
        <div className="conflict-compare-grid">
          {/* Local Version Column */}
          <div className="compare-col compare-local">
            <div className="compare-col-head">
              <span className="compare-tag tag-local">Local Draft (Offline)</span>
              <span className="compare-ver">Base Ver: {localBaseVersion}</span>
            </div>
            <div className="compare-fields">
              <div className="compare-field">
                <label><Clock size={11} /> Created At</label>
                <span>{localCreatedAt}</span>
              </div>
              <div className="compare-field">
                <label><FileText size={11} /> Draft / Note Content</label>
                <div className="compare-text-box">{localSummary}</div>
              </div>
              <div className="compare-field">
                <label>Action Attempted</label>
                <span><code>{action.action_type}</code></span>
              </div>
            </div>
          </div>

          {/* Server Version Column */}
          <div className="compare-col compare-server">
            <div className="compare-col-head">
              <span className="compare-tag tag-server">Server Authoritative (Current)</span>
              <span className="compare-ver">Server Ver: {serverVersion}</span>
            </div>
            <div className="compare-fields">
              <div className="compare-field">
                <label><Clock size={11} /> Last Server Update</label>
                <span>{serverUpdatedAt}</span>
              </div>
              <div className="compare-field">
                <label>Current State</label>
                <span className="compare-state-badge">[{serverState}]</span>
              </div>
              <div className="compare-field">
                <label><FileText size={11} /> Server Summary</label>
                <div className="compare-text-box">{serverSummary}</div>
              </div>
              {serverDueAt !== "—" && (
                <div className="compare-field">
                  <label>Due Date</label>
                  <span>{serverDueAt}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resolution Strategy Picker */}
        <div className="conflict-strategy-section">
          <h4>Choose Resolution Strategy</h4>
          <div className="strategy-options">
            <label className={`strategy-card ${strategy === "KEEP_SERVER" ? "strategy-card-selected" : ""}`}>
              <input
                type="radio"
                name="resolutionStrategy"
                value="KEEP_SERVER"
                checked={strategy === "KEEP_SERVER"}
                onChange={() => setStrategy("KEEP_SERVER")}
              />
              <div>
                <strong>Accept Server Version</strong>
                <p>Discard local modifications and align with current authoritative server state.</p>
              </div>
            </label>

            <label
              className={`strategy-card ${strategy === "KEEP_LOCAL" ? "strategy-card-selected" : ""} ${
                !canOverwrite ? "strategy-card-disabled" : ""
              }`}
            >
              <input
                type="radio"
                name="resolutionStrategy"
                value="KEEP_LOCAL"
                disabled={!canOverwrite}
                checked={strategy === "KEEP_LOCAL"}
                onChange={() => setStrategy("KEEP_LOCAL")}
              />
              <div>
                <strong>Keep Local Version</strong>
                <p>Overwrite server administrative summary with local offline draft.</p>
              </div>
            </label>

            <label
              className={`strategy-card ${strategy === "MANUAL_MERGE" ? "strategy-card-selected" : ""} ${
                !canOverwrite ? "strategy-card-disabled" : ""
              }`}
            >
              <input
                type="radio"
                name="resolutionStrategy"
                value="MANUAL_MERGE"
                disabled={!canOverwrite}
                checked={strategy === "MANUAL_MERGE"}
                onChange={() => {
                  setStrategy("MANUAL_MERGE");
                  if (!mergedSummary) setMergedSummary(serverSummary);
                }}
              />
              <div>
                <strong>Manual Administrative Merge</strong>
                <p>Combine administrative observations into a revised draft.</p>
              </div>
            </label>
          </div>

          {/* Manual merge text box */}
          {strategy === "MANUAL_MERGE" && (
            <div className="manual-merge-box">
              <label htmlFor="merged-summary-input">Merged Administrative Summary:</label>
              <textarea
                id="merged-summary-input"
                rows={3}
                value={mergedSummary}
                onChange={(e) => setMergedSummary(e.target.value)}
                placeholder="Enter reconciled administrative summary..."
              />
            </div>
          )}

          {/* Resolution reason */}
          <div className="resolution-reason-box">
            <label htmlFor="resolution-reason-input">Resolution Audit Rationale:</label>
            <input
              id="resolution-reason-input"
              type="text"
              value={resolutionReason}
              onChange={(e) => setResolutionReason(e.target.value)}
              placeholder="Reason for reconciliation decision..."
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="conflict-error-msg" role="alert">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="conflict-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isSubmitting} type="button">
            Cancel
          </button>
          <button
            className="btn-primary-confirm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            type="button"
          >
            <Check size={14} />
            {isSubmitting ? "Applying Resolution…" : "Confirm & Resolve Conflict"}
          </button>
        </div>
      </div>
    </div>
  );
}
