/**
 * MaatruMitra — Offline Queue & Status Panel Component.
 *
 * ACCESSIBLE & NON-COLOR-DEPENDENT:
 * - Uses distinct icons, text badges, and ARIA roles for each state.
 * - Keyboard navigable with focusable buttons.
 * - Displays exact sync states: LOCAL_DRAFT, WAITING_TO_SYNC, SYNCING, SYNCED, SYNC_FAILED, CONFLICT_REVIEW_REQUIRED.
 */

import { useState } from "react";
import {
  Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Trash2, ChevronDown, ChevronUp, Layers, HelpCircle
} from "lucide-react";
import type { QueuedAction, SyncState } from "../lib/offlineQueue";

interface OfflineQueuePanelProps {
  effectiveOnline: boolean;
  isSimulatedOffline: boolean;
  toggleSimulatedOffline: () => void;
  isLowBandwidth?: boolean;
  toggleLowBandwidth?: () => void;
  queuedActions: QueuedAction[];
  isSyncing: boolean;
  onSyncNow: () => void;
  onRetryAction: (actionId: string) => void;
  onDiscardDraft: (actionId: string) => void;
  onClearSynced: () => void;
  onReviewConflict?: (action: QueuedAction) => void;
}

export function OfflineQueuePanel({
  effectiveOnline,
  isSimulatedOffline,
  toggleSimulatedOffline,
  isLowBandwidth,
  toggleLowBandwidth,
  queuedActions,
  isSyncing,
  onSyncNow,
  onRetryAction,
  onDiscardDraft,
  onClearSynced,
  onReviewConflict,
}: OfflineQueuePanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const pendingCount = queuedActions.filter(
    (a) => a.sync_state === "WAITING_TO_SYNC" || a.sync_state === "LOCAL_DRAFT"
  ).length;
  const failedCount = queuedActions.filter((a) => a.sync_state === "SYNC_FAILED").length;
  const conflictCount = queuedActions.filter((a) => a.sync_state === "CONFLICT_REVIEW_REQUIRED").length;
  const syncedCount = queuedActions.filter((a) => a.sync_state === "SYNCED").length;

  const getStateBadge = (state: SyncState) => {
    switch (state) {
      case "LOCAL_DRAFT":
        return <span className="sync-badge sync-local"><Clock size={12} /> [LOCAL DRAFT]</span>;
      case "WAITING_TO_SYNC":
        return <span className="sync-badge sync-waiting"><Clock size={12} /> [QUEUED]</span>;
      case "SYNCING":
        return <span className="sync-badge sync-syncing"><RefreshCw size={12} className="spin" /> [SYNCING]</span>;
      case "SYNCED":
        return <span className="sync-badge sync-synced"><CheckCircle2 size={12} /> [SYNCED]</span>;
      case "SYNC_FAILED":
        return <span className="sync-badge sync-failed"><AlertTriangle size={12} /> [SYNC FAILED]</span>;
      case "CONFLICT_REVIEW_REQUIRED":
        return <span className="sync-badge sync-conflict"><HelpCircle size={12} /> [CONFLICT]</span>;
    }
  };

  return (
    <div className="offline-panel-container" role="region" aria-label="Offline queue and network status">
      {/* Network Status Strip */}
      <div className="offline-status-bar">
        <div className="offline-status-left">
          {effectiveOnline ? (
            <div className="offline-pill pill-online" role="status" aria-label="Network status: Connected">
              <Wifi size={14} />
              <span>ONLINE</span>
              <span className="pill-sub">— Server Connected</span>
            </div>
          ) : (
            <div className="offline-pill pill-offline" role="status" aria-label="Network status: Offline">
              <WifiOff size={14} />
              <span>OFFLINE</span>
              <span className="pill-sub">
                {isSimulatedOffline ? "— Simulation Active" : "— Local Queue Active"}
              </span>
            </div>
          )}

          {/* Queue count summary badge */}
          {queuedActions.length > 0 && (
            <button
              className="offline-queue-badge"
              onClick={() => setIsOpen(!isOpen)}
              aria-expanded={isOpen}
              type="button"
            >
              <Layers size={13} />
              <span>
                Queue: {queuedActions.length} item{queuedActions.length !== 1 ? "s" : ""}
                {pendingCount > 0 && ` (${pendingCount} pending)`}
                {conflictCount > 0 && ` (${conflictCount} conflict)`}
                {failedCount > 0 && ` (${failedCount} failed)`}
              </span>
              {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>

        <div className="offline-status-right">
          {/* Low Bandwidth toggle */}
          {toggleLowBandwidth && (
            <label className="offline-toggle-label">
              <input
                type="checkbox"
                checked={Boolean(isLowBandwidth)}
                onChange={toggleLowBandwidth}
                className="offline-toggle-checkbox"
                aria-label="Toggle low-bandwidth mode for rural field connectivity"
              />
              <span>Low-Bandwidth Mode</span>
            </label>
          )}

          {/* Simulation toggle */}
          <label className="offline-toggle-label">
            <input
              type="checkbox"
              checked={isSimulatedOffline}
              onChange={toggleSimulatedOffline}
              className="offline-toggle-checkbox"
              aria-label="Simulate offline field mode"
            />
            <span>Simulate Offline</span>
          </label>

          {/* Manual sync button */}
          {effectiveOnline && pendingCount > 0 && (
            <button
              className="offline-sync-btn"
              onClick={onSyncNow}
              disabled={isSyncing}
              type="button"
              aria-label="Synchronize pending actions with server"
            >
              <RefreshCw size={13} className={isSyncing ? "spin" : ""} />
              {isSyncing ? "Syncing…" : "Sync Queue"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Queue Drawer */}
      {isOpen && (
        <div className="offline-queue-drawer" role="dialog" aria-label="Offline actions list">
          <div className="drawer-header">
            <h4>Synthetic Offline Queue ({queuedActions.length})</h4>
            <div className="drawer-actions">
              {syncedCount > 0 && (
                <button className="drawer-btn-secondary" onClick={onClearSynced} type="button">
                  Clear Synced ({syncedCount})
                </button>
              )}
              {effectiveOnline && (pendingCount > 0 || failedCount > 0 || conflictCount > 0) && (
                <button
                  className="drawer-btn-primary"
                  onClick={onSyncNow}
                  disabled={isSyncing}
                  type="button"
                >
                  <RefreshCw size={13} className={isSyncing ? "spin" : ""} />
                  {isSyncing ? "Processing…" : "Process All"}
                </button>
              )}
            </div>
          </div>

          {queuedActions.length === 0 ? (
            <p className="drawer-empty">No synthetic actions queued.</p>
          ) : (
            <div className="drawer-list">
              {queuedActions.map((action) => (
                <div key={action.action_id} className={`queue-item queue-item-${action.sync_state.toLowerCase()}`}>
                  <div className="queue-item-meta">
                    <div className="queue-item-top">
                      {getStateBadge(action.sync_state)}
                      <strong className="queue-action-type">{action.action_type}</strong>
                      <span className="queue-entity">{action.entity_type}</span>
                    </div>

                    <div className="queue-item-details">
                      <span>ID: <code>{action.action_id.slice(0, 10)}…</code></span>
                      <span>Created: {new Date(action.created_at).toLocaleTimeString("en-IN")}</span>
                      {action.retry_count > 0 && <span>Retries: {action.retry_count}</span>}
                    </div>

                    {action.last_error && (
                      <div className="queue-item-error">
                        <AlertTriangle size={12} />
                        <span>{action.last_error}</span>
                      </div>
                    )}

                    {action.conflict_code && (
                      <div className="queue-item-conflict">
                        <HelpCircle size={12} />
                        <span>Conflict Code: <strong>{action.conflict_code}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="queue-item-controls">
                    {action.sync_state === "CONFLICT_REVIEW_REQUIRED" && onReviewConflict && (
                      <button
                        className="item-btn-conflict-review"
                        onClick={() => onReviewConflict(action)}
                        type="button"
                        aria-label={`Review conflict for action ${action.action_id}`}
                      >
                        <HelpCircle size={12} /> Review Conflict
                      </button>
                    )}

                    {(action.sync_state === "SYNC_FAILED" || action.sync_state === "CONFLICT_REVIEW_REQUIRED") && (
                      <button
                        className="item-btn-retry"
                        onClick={() => onRetryAction(action.action_id)}
                        type="button"
                        aria-label={`Retry action ${action.action_id}`}
                      >
                        <RefreshCw size={12} /> Retry
                      </button>
                    )}

                    {/* Discard allowed ONLY on unconfirmed synthetic drafts */}
                    {action.sync_state !== "SYNCED" && (
                      <button
                        className="item-btn-discard"
                        onClick={() => {
                          if (window.confirm("Discard this un-synced synthetic local draft?")) {
                            onDiscardDraft(action.action_id);
                          }
                        }}
                        type="button"
                        aria-label={`Discard local draft ${action.action_id}`}
                      >
                        <Trash2 size={12} /> Discard
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
