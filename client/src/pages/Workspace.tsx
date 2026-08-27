/**
 * MaatruMitra — Authenticated workspace page.
 *
 * A clearly separated demo workspace for ASHA and ANM roles.
 * Shows the real API-connected workflow with strict role boundaries.
 *
 * Uses existing design tokens. Labelled PROTOTYPE throughout.
 * No clinical data, no live patients.
 *
 * Flow:
 * ASHA: Consented upload -> Real synthetic audio attachment -> STT transcript
 *       -> Edit & save revision -> Create draft from revision -> Mark WORKER_REVIEWED
 *       -> Submit for ANM review (AWAITING_ANM_REVIEW)
 * ANM:  Area-scoped queue -> Select assignable ASHA owner -> Confirm / Revise / Dismiss
 * ASHA: Acknowledge & Complete task -> Audit history
 */

import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import {
  LogOut, ShieldCheck, Mic, FileText, CheckCircle,
  XCircle, RefreshCw, AlertTriangle, Headphones, Sparkles,
  ChevronRight, Clock, User, Edit3, History, ChevronDown, ChevronUp,
  Activity, RotateCcw, Check
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import {
  voiceNotes, drafts, tasks, sop, users, beneficiaryRefs, admin, demo, sync,
  type DraftRecord, type TaskRecord, type TranscriptRecord,
  type SopExcerpt, type AuthUser, type AuditEvent, ApiRequestError
} from "../lib/api";
import {
  getAllQueuedActions,
  queueAction,
  retryAction,
  discardLocalDraft,
  clearSyncedActions,
  processOfflineQueue,
  resolveQueuedConflict,
  type QueuedAction,
} from "../lib/offlineQueue";
import { OfflineQueuePanel } from "../components/OfflineQueuePanel";
import { ConflictReviewModal } from "../components/ConflictReviewModal";

const logoImage = "/manus-storage/maatrumitra-care-orbit-logo_1689796a.png";

type WorkspaceStep = "idle" | "note_created" | "transcript_ready" | "draft_ready" | "submitted" | "task_open" | "task_done";

interface WorkspaceState {
  step: WorkspaceStep;
  voiceNoteId: string | null;
  transcriptId: string | null;
  draftId: string | null;
  taskId: string | null;
  transcript: TranscriptRecord | null;
  draft: DraftRecord | null;
  task: TaskRecord | null;
  citation: SopExcerpt | null;
  auditHistory: AuditEvent[];
  error: string | null;
  loading: boolean;
  notice: string | null;
}

export default function Workspace() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { isOnline, isSimulatedOffline, effectiveOnline, toggleSimulatedOffline } = useNetworkStatus();

  const [state, setState] = useState<WorkspaceState>({
    step: "idle",
    voiceNoteId: null,
    transcriptId: null,
    draftId: null,
    taskId: null,
    transcript: null,
    draft: null,
    task: null,
    citation: null,
    auditHistory: [],
    error: null,
    loading: false,
    notice: null,
  });

  const [editedTranscript, setEditedTranscript] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  // Offline queue state
  const [queuedActions, setQueuedActions] = useState<QueuedAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeConflictAction, setActiveConflictAction] = useState<QueuedAction | null>(null);

  // ANM state
  const [assignableAshas, setAssignableAshas] = useState<AuthUser[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [isRevising, setIsRevising] = useState(false);
  const [revisedSummary, setRevisedSummary] = useState("");
  const [revisedDueDays, setRevisedDueDays] = useState(2);
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [areaDrafts, setAreaDrafts] = useState<DraftRecord[]>([]);

  // Readiness checklist state
  const [readiness, setReadiness] = useState<{
    status: string;
    checks: {
      api: string;
      database_schema: string;
      fake_providers: { stt: string; extraction: string };
      synthetic_fixture: string;
      messaging_safety: string;
    };
  } | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  if (!user) {
    navigate("/login");
    return null;
  }

  const setError = (msg: string) =>
    setState((s) => ({ ...s, error: msg, loading: false }));

  const setLoading = (loading: boolean) =>
    setState((s) => ({ ...s, loading, error: null }));

  const isASHA = user.role === "ASHA_WORKER";
  const isANM = user.role === "ANM_REVIEWER" || user.role === "PHC_ADMIN";
  const isAdmin = user.role === "PHC_ADMIN";

  const refreshQueue = useCallback(async () => {
    const items = await getAllQueuedActions();
    setQueuedActions(items);
  }, []);

  // Load readiness checks, queue & ANM queue
  useEffect(() => {
    refreshQueue();

    demo.getReadiness()
      .then((res) => setReadiness(res))
      .catch(() => {});

    if (isANM) {
      users.getAssignableAshas()
        .then((res) => {
          setAssignableAshas(res.items);
          if (res.items.length > 0 && !selectedOwnerId) {
            setSelectedOwnerId(res.items[0].id);
          }
        })
        .catch(() => {});

      drafts.list()
        .then((res) => setAreaDrafts(res.items))
        .catch(() => {});
    }
  }, [isANM, refreshQueue]);

  // Sync processor
  const handleSyncQueue = useCallback(async () => {
    if (isSyncing || !effectiveOnline) return;
    setIsSyncing(true);
    try {
      const summary = await processOfflineQueue(async (action) => {
        return await sync.applyAction({
          action_id: action.action_id,
          idempotency_key: action.idempotency_key,
          entity_type: action.entity_type,
          entity_id: action.entity_id,
          action_type: action.action_type,
          base_server_version: action.base_server_version,
          payload: action.payload,
          created_at: action.created_at,
        });
      });

      await refreshQueue();

      if (summary.conflictCount > 0) {
        setState((s) => ({
          ...s,
          notice: `Sync completed with ${summary.conflictCount} conflict(s). Review required in offline queue panel.`,
        }));
      } else if (summary.syncedCount > 0) {
        setState((s) => ({
          ...s,
          notice: `Successfully synced ${summary.syncedCount} queued action(s) to server.`,
        }));
      }
    } catch {
      setError("Failed to synchronize offline queue.");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, effectiveOnline, refreshQueue]);

  const handleRetryAction = useCallback(async (actionId: string) => {
    await retryAction(actionId);
    await refreshQueue();
    handleSyncQueue();
  }, [refreshQueue, handleSyncQueue]);

  const handleDiscardDraft = useCallback(async (actionId: string) => {
    try {
      await discardLocalDraft(actionId);
      await refreshQueue();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Cannot discard draft.");
    }
  }, [refreshQueue]);

  const handleClearSynced = useCallback(async () => {
    await clearSyncedActions();
    await refreshQueue();
  }, [refreshQueue]);

  // Load audit history when draft is created or updated
  const refreshAuditHistory = useCallback(async (draftId: string) => {
    try {
      const res = await drafts.get(draftId);
      setState((s) => ({ ...s, auditHistory: res.audit_history, citation: res.citation }));
    } catch {}
  }, []);

  // Conflict resolution action
  const handleResolveConflict = useCallback(
    async (
      actionId: string,
      resolutionStrategy: "KEEP_SERVER" | "KEEP_LOCAL" | "MANUAL_MERGE",
      resolvedFields?: Record<string, unknown>,
      reason?: string
    ) => {
      const action = queuedActions.find((a) => a.action_id === actionId);
      if (!action) return;

      const entityType =
        action.entity_type === "TRANSCRIPT_REVISION" ? "FOLLOW_UP_DRAFT" : action.entity_type;

      const res = await sync.resolveConflict({
        entity_type: entityType,
        entity_id: action.entity_id,
        base_server_version: action.base_server_version ?? 1,
        resolution_strategy: resolutionStrategy,
        resolved_fields: resolvedFields,
        resolution_reason: reason || "Reconciled through conflict review screen",
        local_snapshot: action.payload,
      });

      await resolveQueuedConflict(actionId, res.authoritative_entity);
      await refreshQueue();

      setState((s) => ({
        ...s,
        notice: `Conflict successfully resolved (${resolutionStrategy}). Version updated to ${res.new_server_version}.`,
      }));

      if (state.draftId) refreshAuditHistory(state.draftId);
    },
    [queuedActions, refreshQueue, state.draftId, refreshAuditHistory]
  );

  // Admin reset action
  const handleAdminReset = useCallback(async () => {
    if (!window.confirm("Reset all synthetic fixtures and local storage? This restores the clean demo state.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await admin.resetDemo();
      setResetSuccess(res.message);
      reset();
      await clearSyncedActions();
      await refreshQueue();
      // Reload readiness
      demo.getReadiness().then((r) => setReadiness(r)).catch(() => {});
      if (isANM) {
        drafts.list().then((d) => setAreaDrafts(d.items)).catch(() => {});
      }
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to reset demo environment.");
    } finally {
      setLoading(false);
    }
  }, [isANM, refreshQueue]);

  // ── ASHA ACTIONS ──────────────────────────────────────────────────────────

  const startDemoFlow = useCallback(async () => {
    setLoading(true);

    // If offline (simulated or physical), create local draft queue item
    if (!effectiveOnline) {
      const localVnId = `vn_local_${Date.now()}`;
      const localTxId = `tx_local_${Date.now()}`;
      const defaultText = "ಗರ್ಭಿಣಿ ತಪಾಸಣೆ ವೇಳೆ ಐರನ್ ಮಾತ್ರೆ ಸೇವನೆ ನಿಲ್ಲಿಸಿರುವುದು ಕಂಡುಬಂದಿದೆ. ಮನೆ ಭೇಟಿ ಮಾಡಿ ಮಾಹಿತಿ ನೀಡಬೇಕು.";

      await queueAction({
        entity_type: "VOICE_NOTE",
        entity_id: localVnId,
        action_type: "CREATE_INTENT",
        payload: {
          beneficiary_reference_id: "demo-ben-001",
          consent_given: true,
          language_declared: "kn",
          byte_size: 1024,
        },
        sync_state: "LOCAL_DRAFT",
      });

      await refreshQueue();
      setEditedTranscript(defaultText);

      setState((s) => ({
        ...s,
        step: "transcript_ready",
        voiceNoteId: localVnId,
        transcriptId: localTxId,
        transcript: {
          id: localTxId,
          source: "PROVIDER",
          language: "kn",
          text: defaultText,
          confidence_summary: "0.91",
          provider_name: "fake-kannada-stt (offline cached)",
          created_at: new Date().toISOString(),
        },
        notice: "Offline simulation: Field note recorded locally (LOCAL_DRAFT). You can review, edit, and queue offline.",
        loading: false,
      }));
      return;
    }

    try {
      // 1. Fetch synthetic fixture BEN-DEMO-001
      const benRef = await beneficiaryRefs.getDemo();

      // 2. Create upload intent
      const intentResult = await voiceNotes.createIntent({
        beneficiary_reference_id: benRef.id,
        mime_type: "audio/webm",
        byte_size: 1024,
        duration_seconds: 15,
        consent_given: true,
        language_declared: "kn",
      });

      // 3. Attach synthetic audio fixture (upload synthetic webm header bytes)
      const syntheticAudio = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });
      await voiceNotes.uploadAudio(intentResult.upload_url, syntheticAudio);

      // 4. Submit for transcription
      await voiceNotes.submit(intentResult.voice_note.id);

      setState((s) => ({
        ...s,
        step: "note_created",
        voiceNoteId: intentResult.voice_note.id,
        notice: "Synthetic voice note uploaded & submitted. Transcription in progress (~15s).",
        loading: false,
      }));

      pollForTranscript(intentResult.voice_note.id);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`API error (${err.status}): ${err.body.error}`);
      } else {
        setError("Failed to start demo flow. Is the server running?");
      }
    }
  }, [effectiveOnline, refreshQueue]);

  const pollForTranscript = useCallback(async (vnId: string) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      if (attempts > 20) {
        setError("Transcription timed out. Please try again.");
        return;
      }
      try {
        const result = await voiceNotes.getTranscripts(vnId);
        const providerTranscript = result.transcripts.find((t) => t.source === "PROVIDER");
        if (providerTranscript) {
          setEditedTranscript(providerTranscript.text);
          setState((s) => ({
            ...s,
            step: "transcript_ready",
            transcript: providerTranscript,
            transcriptId: providerTranscript.id,
            notice: "STT transcript ready. Review and correct before creating follow-up draft.",
            loading: false,
          }));
        } else {
          setTimeout(poll, 3000);
        }
      } catch {
        setTimeout(poll, 3000);
      }
    };
    setTimeout(poll, 3000);
  }, []);

  // Step 2 & 3: Save worker revision -> Create draft from revision -> Mark WORKER_REVIEWED
  const saveAndCreateDraft = useCallback(async () => {
    if (!state.voiceNoteId) return;
    setLoading(true);

    if (!effectiveOnline) {
      const localDraftId = `draft_local_${Date.now()}`;
      const localTxId = state.transcriptId ?? `tx_local_${Date.now()}`;

      // Enqueue revision & draft actions
      await queueAction({
        entity_type: "TRANSCRIPT_REVISION",
        entity_id: localTxId,
        action_type: "SAVE_WORKER_EDIT",
        payload: { voice_note_id: state.voiceNoteId, text: editedTranscript, language: "kn" },
        sync_state: "WAITING_TO_SYNC",
      });

      await queueAction({
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: localDraftId,
        action_type: "CREATE_FROM_TRANSCRIPT",
        payload: { transcript_id: localTxId },
        sync_state: "WAITING_TO_SYNC",
      });

      await queueAction({
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: localDraftId,
        action_type: "MARK_WORKER_REVIEWED",
        payload: {},
        sync_state: "WAITING_TO_SYNC",
      });

      await refreshQueue();

      const localDraft: DraftRecord = {
        id: localDraftId,
        voice_note_id: state.voiceNoteId,
        transcript_id: localTxId,
        state: "WORKER_REVIEWED",
        administrative_category: "IFA_SUPPLEMENT_FOLLOW_UP",
        summary: "ಗರ್ಭಿಣಿ ಐರನ್ ಮಾತ್ರೆ ಸೇವನೆ ನಿಲ್ಲಿಸಿರುವ ಬಗ್ಗೆ ಪರಿಶೀಲನೆ ಹಾಗೂ ಮನೆ ಭೇಟಿ (ಸ್ಥಳೀಯ ದಾಖಲೆ)",
        proposed_owner_user_id: user?.id ?? null,
        proposed_due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        citation_id: "demo-sop-exc-001",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setState((s) => ({
        ...s,
        step: "draft_ready",
        draftId: localDraftId,
        draft: localDraft,
        notice: "Worker revision saved locally (WAITING_TO_SYNC). Ready for ANM review once synchronized.",
        loading: false,
      }));
      return;
    }

    try {
      // 1. Save worker edited revision
      const revRes = await voiceNotes.addTranscriptRevision(
        state.voiceNoteId,
        editedTranscript,
        "kn"
      );

      // 2. Create draft strictly from the worker-reviewed revision
      const draftRes = await drafts.createFromTranscript(revRes.transcript.id);

      // 3. Mark worker reviewed (TRANSCRIPT_READY -> WORKER_REVIEWED)
      const reviewedRes = await drafts.markReviewed(draftRes.draft.id);

      let citation: SopExcerpt | null = null;
      if (reviewedRes.draft.citation_id) {
        const sopResult = await sop.search("supplement routine home visit", 1);
        citation = sopResult.excerpts[0] ?? null;
      }

      setState((s) => ({
        ...s,
        step: "draft_ready",
        transcriptId: revRes.transcript.id,
        transcript: revRes.transcript,
        draftId: reviewedRes.draft.id,
        draft: reviewedRes.draft,
        citation,
        notice: "Worker revision saved and draft verified (WORKER_REVIEWED). Ready for ANM review.",
        loading: false,
      }));

      refreshAuditHistory(reviewedRes.draft.id);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to create administrative draft.");
    }
  }, [state.voiceNoteId, state.transcriptId, editedTranscript, effectiveOnline, user?.id, refreshQueue, refreshAuditHistory]);

  const submitForReview = useCallback(async () => {
    if (!state.draftId) return;
    setLoading(true);

    if (!effectiveOnline) {
      await queueAction({
        entity_type: "FOLLOW_UP_DRAFT",
        entity_id: state.draftId,
        action_type: "SUBMIT_TO_ANM",
        payload: { worker_note: reviewNote },
        sync_state: "WAITING_TO_SYNC",
      });

      await refreshQueue();

      setState((s) => ({
        ...s,
        step: "submitted",
        notice: "Draft submission queued (WAITING_TO_SYNC). It will appear in ANM queue after sync.",
        loading: false,
      }));
      return;
    }

    try {
      const result = await drafts.submitForReview(state.draftId, reviewNote || undefined);
      setState((s) => ({
        ...s,
        step: "submitted",
        draft: result.draft,
        notice: "Draft submitted for ANM review (AWAITING_ANM_REVIEW). No automated message sent.",
        loading: false,
      }));
      refreshAuditHistory(state.draftId);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to submit for review.");
    }
  }, [state.draftId, reviewNote, effectiveOnline, refreshQueue, refreshAuditHistory]);

  // ── ANM ACTIONS ───────────────────────────────────────────────────────────

  const selectDraftToReview = useCallback(async (d: DraftRecord) => {
    setLoading(true);
    try {
      const fullDraft = await drafts.get(d.id);
      setState((s) => ({
        ...s,
        step: "draft_ready",
        draftId: fullDraft.draft.id,
        draft: fullDraft.draft,
        citation: fullDraft.citation,
        auditHistory: fullDraft.audit_history,
        notice: "Reviewing area draft. Select an ASHA owner before confirming.",
        loading: false,
      }));
      setRevisedSummary(fullDraft.draft.summary ?? "");
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to load draft.");
    }
  }, []);

  const confirmDraft = useCallback(async () => {
    if (!state.draftId || !selectedOwnerId) {
      setError("Please select an eligible ASHA task owner.");
      return;
    }
    setLoading(true);
    try {
      const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const result = await drafts.confirm(state.draftId, selectedOwnerId, due, reviewNote || undefined);
      setState((s) => ({
        ...s,
        step: "task_open",
        task: result.task,
        draft: result.draft,
        taskId: result.task.id,
        notice: result.notice,
        loading: false,
      }));
      refreshAuditHistory(state.draftId);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to confirm draft.");
    }
  }, [state.draftId, selectedOwnerId, reviewNote, refreshAuditHistory]);

  const executeRevise = useCallback(async () => {
    if (!state.draftId || !reviewNote.trim()) {
      setError("Reviewer note is required when revising a draft.");
      return;
    }
    setLoading(true);
    try {
      const due = new Date(Date.now() + revisedDueDays * 24 * 60 * 60 * 1000).toISOString();
      const result = await drafts.revise(state.draftId, {
        owner_user_id: selectedOwnerId || undefined,
        due_at: due,
        reviewer_note: reviewNote,
        revised_summary: revisedSummary || undefined,
      });
      setState((s) => ({
        ...s,
        draft: result.draft,
        notice: "Draft revised successfully. Changes logged in audit trail.",
        loading: false,
      }));
      setIsRevising(false);
      refreshAuditHistory(state.draftId);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to revise draft.");
    }
  }, [state.draftId, reviewNote, revisedDueDays, selectedOwnerId, revisedSummary, refreshAuditHistory]);

  const dismissDraft = useCallback(async () => {
    if (!state.draftId || !dismissReason.trim()) {
      setError("Please enter a dismissal reason.");
      return;
    }
    setLoading(true);
    try {
      const result = await drafts.dismiss(state.draftId, dismissReason);
      setState((s) => ({
        ...s,
        draft: result.draft,
        notice: "Draft dismissed. No action was taken.",
        loading: false,
      }));
      refreshAuditHistory(state.draftId);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to dismiss draft.");
    }
  }, [state.draftId, dismissReason, refreshAuditHistory]);

  // ── TASK COMPLETION ───────────────────────────────────────────────────────

  const completeTask = useCallback(async () => {
    if (!state.taskId) return;
    setLoading(true);
    try {
      await tasks.acknowledge(state.taskId);
      const result = await tasks.complete(state.taskId, "Completed home visit follow-up.");
      setState((s) => ({
        ...s,
        step: "task_done",
        task: result.task,
        notice: result.notice,
        loading: false,
      }));
      if (state.draftId) refreshAuditHistory(state.draftId);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to complete task.");
    }
  }, [state.taskId, state.draftId, refreshAuditHistory]);

  const reset = useCallback(() => {
    setState({
      step: "idle", voiceNoteId: null, transcriptId: null,
      draftId: null, taskId: null, transcript: null, draft: null,
      task: null, citation: null, auditHistory: [], error: null, loading: false, notice: null,
    });
    setEditedTranscript("");
    setReviewNote("");
    setDismissReason("");
    setIsRevising(false);
  }, []);

  const steps: Array<{ id: WorkspaceStep | string; label: string; done: boolean }> = [
    { id: "note_created", label: "Voice note", done: ["note_created","transcript_ready","draft_ready","submitted","task_open","task_done"].includes(state.step) },
    { id: "transcript_ready", label: "Transcript", done: ["transcript_ready","draft_ready","submitted","task_open","task_done"].includes(state.step) },
    { id: "draft_ready", label: "Admin draft", done: ["draft_ready","submitted","task_open","task_done"].includes(state.step) },
    { id: "submitted", label: "ANM review", done: ["submitted","task_open","task_done"].includes(state.step) },
    { id: "task_open", label: "Task", done: ["task_open","task_done"].includes(state.step) },
  ];

  return (
    <main className="workspace-shell">
      {/* Header */}
      <header className="workspace-header" aria-label="Workspace header">
        <a className="brand" href="/" aria-label="MaatruMitra home">
          <img className="brand-mark" src={logoImage} alt="" />
          <span className="brand-name">Maatru<span>Mitra</span></span>
        </a>
        <div className="workspace-user-info">
          <span className="ws-role-badge">{user.role.replace(/_/g, " ")}</span>
          <span className="ws-username">{user.display_name}</span>
          <button className="ws-logout" onClick={logout} type="button" aria-label="Sign out">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>

      {/* Prototype notice */}
      <div className="workspace-proto-bar" role="note" aria-label="Prototype notice">
        <ShieldCheck size={13} />
        <span>PROTOTYPE — Synthetic identities only · Administrative workflow · Human confirmation required for every action</span>
      </div>

      <div className="workspace-body">
        {/* Progress rail */}
        <aside className="ws-rail" aria-label="Workflow progress">
          <p className="ws-rail-label">Workflow state</p>
          {steps.map((s, i) => (
            <div key={s.id} className={`ws-rail-item ${s.done ? "is-done" : ""} ${state.step === s.id ? "is-current" : ""}`}>
              <span className="ws-rail-num">{String(i + 1).padStart(2, "0")}</span>
              <span>{s.label}</span>
              {s.done && <CheckCircle size={13} className="ws-rail-check" />}
            </div>
          ))}

          {/* Demo Readiness Checklist */}
          <div style={{ marginTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1rem" }}>
            <button
              className="button-text"
              style={{ width: "100%", justifyContent: "space-between", fontSize: "0.82rem", display: "flex", alignItems: "center", padding: "0.2rem 0" }}
              onClick={() => setShowChecklist(!showChecklist)}
              type="button"
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Activity size={14} /> Demo Checklist ({readiness?.status === "ready" ? "🟢 Ready" : "🟡 Checking"})
              </span>
              {showChecklist ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showChecklist && readiness && (
              <div style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "0.6rem", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div>✓ API: <span style={{ color: "var(--color-emerald-400)" }}>{readiness.checks.api}</span></div>
                <div>✓ Schema: <span style={{ color: "var(--color-emerald-400)" }}>{readiness.checks.database_schema}</span></div>
                <div>✓ Fake Providers: <span style={{ color: "var(--color-emerald-400)" }}>active</span></div>
                <div>✓ Demo Fixture: <span style={{ color: "var(--color-emerald-400)" }}>{readiness.checks.synthetic_fixture}</span></div>
                <div>🔒 Outbox: <span style={{ color: "var(--color-amber-400)" }}>DISABLED (Safety Lock)</span></div>
              </div>
            )}
          </div>

          {/* Audit Trail Drawer Toggle */}
          {state.draftId && (
            <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1rem" }}>
              <button
                className="button-text"
                style={{ width: "100%", justifyContent: "space-between", fontSize: "0.82rem", display: "flex", alignItems: "center", padding: "0.2rem 0" }}
                onClick={() => setShowAuditDrawer(!showAuditDrawer)}
                type="button"
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <History size={14} /> Audit Trail ({state.auditHistory.length})
                </span>
                {showAuditDrawer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          )}

          {/* Admin Reset Button */}
          {isAdmin && (
            <div style={{ marginTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1rem" }}>
              <button
                className="button-text"
                style={{ width: "100%", fontSize: "0.8rem", color: "var(--color-amber-400)", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "6px", padding: "0.5rem", justifyContent: "center", display: "flex", alignItems: "center", gap: "0.4rem" }}
                onClick={handleAdminReset}
                type="button"
                id="ws-admin-reset"
              >
                <RotateCcw size={13} /> Reset Demo Data &amp; Storage
              </button>
            </div>
          )}
        </aside>

        {/* Main panel */}
        <section className="ws-main" aria-label="Active workflow panel">

          {/* Offline Queue & Network Status Panel */}
          <OfflineQueuePanel
            effectiveOnline={effectiveOnline}
            isSimulatedOffline={isSimulatedOffline}
            toggleSimulatedOffline={toggleSimulatedOffline}
            queuedActions={queuedActions}
            isSyncing={isSyncing}
            onSyncNow={handleSyncQueue}
            onRetryAction={handleRetryAction}
            onDiscardDraft={handleDiscardDraft}
            onClearSynced={handleClearSynced}
            onReviewConflict={(act) => setActiveConflictAction(act)}
          />

          {/* Conflict Review Modal */}
          {activeConflictAction && (
            <ConflictReviewModal
              action={activeConflictAction}
              userRole={user.role}
              onClose={() => setActiveConflictAction(null)}
              onResolve={handleResolveConflict}
            />
          )}

          {/* Reset Success Notice */}
          {resetSuccess && (
            <div className="ws-alert ws-alert-notice" role="status" style={{ borderLeftColor: "var(--color-emerald-400)" }}>
              <Check size={14} />
              <span>{resetSuccess}</span>
            </div>
          )}

          {/* Error */}
          {state.error && (
            <div className="ws-alert ws-alert-error" role="alert">
              <AlertTriangle size={15} />
              <span style={{ whiteSpace: "pre-line" }}>{state.error}</span>
            </div>
          )}

          {/* Notice */}
          {state.notice && !state.error && (
            <div className="ws-alert ws-alert-notice" role="status">
              <ShieldCheck size={14} />
              <span style={{ whiteSpace: "pre-line" }}>{state.notice}</span>
            </div>
          )}

          {/* ── IDLE ─────────────────────────────────────────────────── */}
          {state.step === "idle" && (
            <div className="ws-card">
              <div className="ws-card-label"><Mic size={14} /> Start demo flow</div>
              <h2 className="ws-card-heading">Begin with a<br /><em>Kannada field note.</em></h2>
              <p className="ws-card-body">
                This workspace demonstrates the administrative follow-up workflow connected to the real API.
                Uses synthetic beneficiary fixture <code>BEN-DEMO-001</code> and the fake STT provider.
              </p>

              {isASHA && (
                <button className="button-primary ws-action" onClick={startDemoFlow} disabled={state.loading} type="button" id="ws-start-demo">
                  {state.loading ? <RefreshCw size={15} className="spin" /> : <Mic size={15} />}
                  {state.loading ? "Starting…" : "Start ASHA demo flow"}
                </button>
              )}

              {isANM && (
                <div style={{ marginTop: "1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", color: "var(--color-slate-200)", marginBottom: "0.5rem" }}>
                    Area Review Queue ({areaDrafts.length} awaiting review)
                  </h3>
                  {areaDrafts.length === 0 ? (
                    <p className="ws-card-body ws-anm-hint">
                      No drafts awaiting review in your area. Log in as <code>asha.demo</code> to create and submit a draft.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {areaDrafts.map((d) => (
                        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px" }}>
                          <div>
                            <strong>{d.administrative_category?.replace(/_/g, " ")}</strong>
                            <div style={{ fontSize: "0.8rem", color: "var(--color-slate-400)" }}>{d.summary?.slice(0, 70)}…</div>
                          </div>
                          <button className="button-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }} onClick={() => selectDraftToReview(d)} type="button">
                            Review Draft
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── NOTE CREATED ─────────────────────────────────────────── */}
          {state.step === "note_created" && (
            <div className="ws-card">
              <div className="ws-card-label"><Headphones size={14} /> Voice note submitted</div>
              <h2 className="ws-card-heading">Transcription<br /><em>in progress.</em></h2>
              <p className="ws-card-body">
                Processing the demo Kannada fixture through fake STT. Polling for transcript…
              </p>
              <div className="ws-loading-bar" aria-label="Processing" role="progressbar">
                <div className="ws-loading-bar-inner" />
              </div>
              <p className="ws-meta">Voice note ID: <code>{state.voiceNoteId}</code></p>
            </div>
          )}

          {/* ── TRANSCRIPT READY ──────────────────────────────────────── */}
          {state.step === "transcript_ready" && (
            <div className="ws-card">
              <div className="ws-card-label"><FileText size={14} /> Transcript ready for review</div>
              <h2 className="ws-card-heading">Review and correct<br /><em>the transcript.</em></h2>
              <p className="ws-card-body">
                Make corrections to the STT text. Saving creates an audited worker revision from which the draft is generated.
              </p>
              <div className="ws-transcript-box">
                <div className="ws-transcript-source">
                  <span>Provider transcript · {state.transcript?.confidence_summary}</span>
                </div>
                <textarea
                  id="transcript-editor"
                  className="ws-transcript-editor"
                  lang="kn"
                  value={editedTranscript}
                  onChange={(e) => setEditedTranscript(e.target.value)}
                  rows={4}
                  aria-label="Editable transcript"
                />
              </div>
              <div className="ws-actions">
                <button className="button-primary ws-action" onClick={saveAndCreateDraft} disabled={state.loading} type="button" id="ws-create-draft">
                  {state.loading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
                  {state.loading ? "Creating draft…" : "Save revision & create admin draft"}
                </button>
              </div>
            </div>
          )}

          {/* ── DRAFT READY ───────────────────────────────────────────── */}
          {state.step === "draft_ready" && state.draft && (
            <div className="ws-card">
              <div className="ws-card-label"><Sparkles size={14} /> Administrative draft · Human review required</div>
              <h2 className="ws-card-heading">Draft follow-up<br /><em>created.</em></h2>

              <div className="ws-fact-grid">
                <div><span>Category</span><strong>{state.draft.administrative_category?.replace(/_/g," ") ?? "—"}</strong></div>
                <div><span>State</span><strong>{state.draft.state}</strong></div>
                <div><span>Draft ID</span><strong><code>{state.draft.id.slice(0, 12)}…</code></strong></div>
              </div>

              <div className="ws-summary-box">
                <span>Worker observation summary</span>
                <p>{state.draft.summary ?? "—"}</p>
              </div>

              {state.citation && (
                <div className="ws-citation-box">
                  <span className="ws-citation-label">Approved SOP reference</span>
                  <strong>{state.citation.document.title}</strong>
                  <p className="ws-citation-section">{state.citation.section_label} · {state.citation.page_reference}</p>
                  <p className="ws-citation-text">{state.citation.excerpt_text.substring(0, 300)}…</p>
                  <span className="ws-citation-note">{state.citation.citation_note}</span>
                </div>
              )}

              <div className="ws-safety-bar">
                <ShieldCheck size={13} />
                <span>Administrative flag only · Not a clinical assessment · ANM review required</span>
              </div>

              {isASHA && state.draft.state === "WORKER_REVIEWED" && (
                <div className="ws-actions">
                  <div className="ws-field" style={{ width: "100%" }}>
                    <label htmlFor="ws-worker-note">Optional worker note (for ANM)</label>
                    <input id="ws-worker-note" type="text" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Any context for the ANM reviewer" />
                  </div>
                  <button className="button-primary ws-action" onClick={submitForReview} disabled={state.loading} type="button" id="ws-submit-review">
                    <ChevronRight size={15} /> Submit for ANM review
                  </button>
                </div>
              )}

              {isANM && (
                <div className="ws-actions ws-anm-actions" style={{ flexDirection: "column", gap: "1rem", width: "100%" }}>
                  {/* ASHA task owner selection */}
                  <div className="ws-field" style={{ width: "100%" }}>
                    <label htmlFor="ws-owner-select">Assign ASHA Task Owner (Required)</label>
                    <select
                      id="ws-owner-select"
                      style={{ padding: "0.6rem", borderRadius: "8px", background: "#111b27", color: "#e2e8f0", border: "1px solid #1e293b", width: "100%" }}
                      value={selectedOwnerId}
                      onChange={(e) => setSelectedOwnerId(e.target.value)}
                    >
                      {assignableAshas.map((a) => (
                        <option key={a.id} value={a.id}>{a.display_name} ({a.role})</option>
                      ))}
                    </select>
                  </div>

                  <div className="ws-field" style={{ width: "100%" }}>
                    <label htmlFor="ws-reviewer-note">Reviewer Note / Instruction</label>
                    <input id="ws-reviewer-note" type="text" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Instruction for the ASHA worker" />
                  </div>

                  {/* Actions row */}
                  <div style={{ display: "flex", gap: "0.75rem", width: "100%", flexWrap: "wrap" }}>
                    <button className="ws-confirm-btn" onClick={confirmDraft} disabled={state.loading || !selectedOwnerId} type="button" id="ws-confirm-draft">
                      <CheckCircle size={15} /> Confirm &amp; create task
                    </button>
                    <button className="button-text" style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "0.6rem 1rem" }} onClick={() => setIsRevising(!isRevising)} type="button">
                      <Edit3 size={15} /> {isRevising ? "Cancel Revision" : "Revise Fields"}
                    </button>
                  </div>

                  {/* Revision Sub-panel */}
                  {isRevising && (
                    <div style={{ padding: "1rem", background: "rgba(255,255,255,0.04)", borderRadius: "8px", width: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div className="ws-field">
                        <label htmlFor="ws-revised-summary">Revised Administrative Summary</label>
                        <input id="ws-revised-summary" type="text" value={revisedSummary} onChange={(e) => setRevisedSummary(e.target.value)} />
                      </div>
                      <div className="ws-field">
                        <label htmlFor="ws-revised-due">Due in (days)</label>
                        <input id="ws-revised-due" type="number" min={1} max={30} value={revisedDueDays} onChange={(e) => setRevisedDueDays(parseInt(e.target.value, 10))} />
                      </div>
                      <button className="button-primary" onClick={executeRevise} disabled={state.loading || !reviewNote.trim()} type="button">
                        Submit Revision (REVISED)
                      </button>
                    </div>
                  )}

                  {/* Dismissal */}
                  <div style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.75rem" }}>
                    <div className="ws-field">
                      <label htmlFor="ws-dismiss-reason">Dismissal reason (required to dismiss)</label>
                      <input id="ws-dismiss-reason" type="text" value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} placeholder="Reason for dismissal" />
                    </div>
                    <button className="ws-dismiss-btn" onClick={dismissDraft} disabled={state.loading || !dismissReason.trim()} type="button" id="ws-dismiss-draft">
                      <XCircle size={15} /> Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SUBMITTED ─────────────────────────────────────────────── */}
          {state.step === "submitted" && (
            <div className="ws-card">
              <div className="ws-card-label"><Clock size={14} /> Awaiting ANM review</div>
              <h2 className="ws-card-heading">Draft submitted.<br /><em>Awaiting confirmation.</em></h2>
              <p className="ws-card-body">
                Draft is now in the ANM review queue (<code>AWAITING_ANM_REVIEW</code>). Sign in as <code>anm.demo</code> to confirm, revise, or dismiss.
              </p>
              <p className="ws-meta">Draft state: <strong>{state.draft?.state}</strong> · Draft ID: <code>{state.draftId?.slice(0,12)}…</code></p>
            </div>
          )}

          {/* ── TASK OPEN ─────────────────────────────────────────────── */}
          {state.step === "task_open" && state.task && (
            <div className="ws-card">
              <div className="ws-card-label"><User size={14} /> Task created &amp; open</div>
              <h2 className="ws-card-heading">Follow-up task<br /><em>confirmed.</em></h2>
              <div className="ws-fact-grid">
                <div><span>Task status</span><strong>{state.task.status}</strong></div>
                <div><span>Assigned Owner</span><strong>{state.task.owner_user_id}</strong></div>
                <div><span>Due</span><strong>{new Date(state.task.due_at).toLocaleDateString("en-IN")}</strong></div>
              </div>
              <div className="ws-safety-bar">
                <ShieldCheck size={13} />
                <span>No automated messages sent · Task assigned to ASHA · Human confirmation required</span>
              </div>
              <button className="button-primary ws-action" onClick={completeTask} disabled={state.loading} type="button" id="ws-complete-task">
                <CheckCircle size={15} /> Acknowledge &amp; complete task
              </button>
            </div>
          )}

          {/* ── TASK DONE ─────────────────────────────────────────────── */}
          {state.step === "task_done" && (
            <div className="ws-card ws-card-confirmed">
              <div className="ws-card-label"><CheckCircle size={14} /> Task completed</div>
              <h2 className="ws-card-heading">Follow-up<br /><em>logged.</em></h2>
              <p className="ws-card-body">
                The full administrative lifecycle is complete. Every state transition is recorded in the immutable audit log.
              </p>
              <div className="ws-safety-bar ws-safety-confirmed">
                <CheckCircle size={13} />
                <span>Workflow complete · Safe audit trail preserved · Zero automated messages</span>
              </div>
              <button className="button-text ws-action" onClick={reset} type="button">
                <RefreshCw size={15} /> Run the demo flow again
              </button>
            </div>
          )}

          {/* ── AUDIT HISTORY DRAWER ─────────────────────────────────── */}
          {showAuditDrawer && state.auditHistory.length > 0 && (
            <div className="ws-card" style={{ marginTop: "1.5rem", borderLeft: "3px solid var(--color-emerald-500)" }}>
              <div className="ws-card-label"><History size={14} /> Audit Trail (Immutable &amp; Redacted)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
                {state.auditHistory.map((e) => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", padding: "0.5rem", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                    <div>
                      <strong style={{ color: "var(--color-slate-200)" }}>{e.event_type}</strong>
                      {e.previous_state && e.next_state && (
                        <span style={{ marginLeft: "0.5rem", color: "var(--color-slate-400)" }}>
                          {e.previous_state} → {e.next_state}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "var(--color-slate-500)", fontSize: "0.75rem" }}>
                      {new Date(e.created_at).toLocaleTimeString("en-IN")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
