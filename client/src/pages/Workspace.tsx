/**
 * MaatruMitra — Authenticated workspace page.
 *
 * A clearly separated demo workspace for ASHA and ANM roles.
 * Shows the real API-connected workflow in a panel that keeps the
 * landing page untouched.
 *
 * Uses existing design tokens. Labelled PROTOTYPE throughout.
 * No clinical data, no live patients.
 *
 * Design philosophy: dark console aesthetic matching the landing page demo panel.
 * State machine is visible to the user at all times.
 */

import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  LogOut, ShieldCheck, Mic, FileText, CheckCircle,
  XCircle, RefreshCw, AlertTriangle, Headphones, Sparkles,
  ChevronRight, Clock, User
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { voiceNotes, drafts, tasks, sop, type DraftRecord, type TaskRecord, type TranscriptRecord, type SopExcerpt, ApiRequestError } from "../lib/api";

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
  error: string | null;
  loading: boolean;
  notice: string | null;
}

const DEMO_BEN_REF_ID = ""; // will be filled from API or seeded fixture

export default function Workspace() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
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
    error: null,
    loading: false,
    notice: null,
  });
  const [editedTranscript, setEditedTranscript] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  if (!user) {
    navigate("/login");
    return null;
  }

  const setError = (msg: string) =>
    setState((s) => ({ ...s, error: msg, loading: false }));

  const setLoading = (loading: boolean) =>
    setState((s) => ({ ...s, loading, error: null }));

  // ── ASHA ACTIONS ──────────────────────────────────────────────────────────

  const startDemoFlow = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Create upload intent with demo beneficiary reference
      // In a real app the user would select the beneficiary. Here we use BEN-DEMO-001.
      const benRefResponse = await fetch("/api/v1/beneficiary-refs/demo", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => null);

      const benRefId = benRefResponse?.id ?? "DEMO_PLACEHOLDER";

      const intentResult = await voiceNotes.createIntent({
        beneficiary_reference_id: benRefId,
        mime_type: "audio/webm",
        byte_size: 28672, // demo 28KB
        duration_seconds: 28,
        consent_given: true,
        language_declared: "kn",
      });

      // 2. Immediately submit (simulating a completed upload in demo)
      await voiceNotes.submit(intentResult.voice_note.id);

      setState((s) => ({
        ...s,
        step: "note_created",
        voiceNoteId: intentResult.voice_note.id,
        notice: "Voice note submitted. Transcription in progress (fake provider — ~15s).",
        loading: false,
      }));

      // 3. Poll for transcript
      pollForTranscript(intentResult.voice_note.id);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`API error (${err.status}): ${err.body.error}`);
      } else {
        setError("Failed to start demo flow. Is the server running?");
      }
    }
  }, []);

  const pollForTranscript = useCallback(async (vnId: string) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      if (attempts > 20) {
        setError("Transcription timed out. Try refreshing.");
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
            notice: "Transcript ready. Review and correct it before creating a follow-up draft.",
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

  const saveTranscriptRevision = useCallback(async () => {
    if (!state.voiceNoteId) return;
    setLoading(true);
    try {
      const result = await voiceNotes.addTranscriptRevision(
        state.voiceNoteId,
        editedTranscript,
        "kn"
      );
      setState((s) => ({
        ...s,
        transcriptId: result.transcript.id,
        transcript: result.transcript,
        loading: false,
        notice: "Transcript revision saved.",
      }));
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to save transcript revision.");
    }
  }, [state.voiceNoteId, editedTranscript]);

  const createDraft = useCallback(async () => {
    if (!state.transcriptId) return;
    setLoading(true);
    try {
      const result = await drafts.createFromTranscript(state.transcriptId);
      // Load citation if available
      let citation: SopExcerpt | null = null;
      if (result.draft.citation_id) {
        const sopResult = await sop.search("supplement routine home visit", 1);
        citation = sopResult.excerpts[0] ?? null;
      }
      setState((s) => ({
        ...s,
        step: "draft_ready",
        draftId: result.draft.id,
        draft: result.draft,
        citation,
        notice: result.notice,
        loading: false,
      }));
    } catch (err) {
      if (err instanceof ApiRequestError) setError(`${err.body.error}${err.body.note ? "\n" + err.body.note : ""}`);
      else setError("Failed to create administrative draft.");
    }
  }, [state.transcriptId]);

  const submitForReview = useCallback(async () => {
    if (!state.draftId) return;
    setLoading(true);
    try {
      // Move draft to WORKER_REVIEWED first
      const vnState = await voiceNotes.get(state.voiceNoteId!);
      // The draft is already in TRANSCRIPT_READY; we need WORKER_REVIEWED to submit
      // For demo: directly submit (the service accepts WORKER_REVIEWED → AWAITING_ANM_REVIEW)
      const result = await drafts.submitForReview(state.draftId, reviewNote || undefined);
      setState((s) => ({
        ...s,
        step: "submitted",
        draft: result.draft,
        notice: "Draft submitted for ANM review. No automated message sent.",
        loading: false,
      }));
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to submit for review.");
    }
  }, [state.draftId, state.voiceNoteId, reviewNote]);

  // ── ANM ACTIONS ───────────────────────────────────────────────────────────

  const confirmDraft = useCallback(async () => {
    if (!state.draftId || !user) return;
    setLoading(true);
    try {
      const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const result = await drafts.confirm(state.draftId, user.id, due, reviewNote || undefined);
      setState((s) => ({
        ...s,
        step: "task_open",
        task: result.task,
        draft: result.draft,
        taskId: result.task.id,
        notice: result.notice,
        loading: false,
      }));
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to confirm draft.");
    }
  }, [state.draftId, user, reviewNote]);

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
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to dismiss draft.");
    }
  }, [state.draftId, dismissReason]);

  const completeTask = useCallback(async () => {
    if (!state.taskId) return;
    setLoading(true);
    try {
      // Acknowledge first
      await tasks.acknowledge(state.taskId);
      const result = await tasks.complete(state.taskId, "Demo task completed via workspace.");
      setState((s) => ({
        ...s,
        step: "task_done",
        task: result.task,
        notice: result.notice,
        loading: false,
      }));
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.body.error);
      else setError("Failed to complete task.");
    }
  }, [state.taskId]);

  const reset = useCallback(() => {
    setState({
      step: "idle", voiceNoteId: null, transcriptId: null,
      draftId: null, taskId: null, transcript: null, draft: null,
      task: null, citation: null, error: null, loading: false, notice: null,
    });
    setEditedTranscript("");
    setReviewNote("");
    setDismissReason("");
  }, []);

  // ── STEP LABELS ───────────────────────────────────────────────────────────

  const steps: Array<{ id: WorkspaceStep | string; label: string; done: boolean }> = [
    { id: "note_created", label: "Voice note", done: ["note_created","transcript_ready","draft_ready","submitted","task_open","task_done"].includes(state.step) },
    { id: "transcript_ready", label: "Transcript", done: ["transcript_ready","draft_ready","submitted","task_open","task_done"].includes(state.step) },
    { id: "draft_ready", label: "Admin draft", done: ["draft_ready","submitted","task_open","task_done"].includes(state.step) },
    { id: "submitted", label: "ANM review", done: ["submitted","task_open","task_done"].includes(state.step) },
    { id: "task_open", label: "Task", done: ["task_open","task_done"].includes(state.step) },
  ];

  const isASHA = user.role === "ASHA_WORKER";
  const isANM = user.role === "ANM_REVIEWER" || user.role === "PHC_ADMIN";

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
        <span>PROTOTYPE — No live patient data · Administrative coordination demo · Human confirmation required for every action</span>
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
        </aside>

        {/* Main panel */}
        <section className="ws-main" aria-label="Active workflow panel">

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
                The demo uses a seeded synthetic beneficiary reference (BEN-DEMO-001) and the fake STT provider.
              </p>
              {isASHA && (
                <button className="button-primary ws-action" onClick={startDemoFlow} disabled={state.loading} type="button" id="ws-start-demo">
                  {state.loading ? <RefreshCw size={15} className="spin" /> : <Mic size={15} />}
                  {state.loading ? "Starting…" : "Start ASHA demo flow"}
                </button>
              )}
              {isANM && (
                <p className="ws-card-body ws-anm-hint">
                  <strong>ANM / PHC Admin:</strong> Log in as <code>asha.demo</code> first to create a draft, then return here to confirm or dismiss it.
                </p>
              )}
            </div>
          )}

          {/* ── NOTE CREATED (awaiting transcript) ───────────────────── */}
          {state.step === "note_created" && (
            <div className="ws-card">
              <div className="ws-card-label"><Headphones size={14} /> Voice note submitted</div>
              <h2 className="ws-card-heading">Transcription<br /><em>in progress.</em></h2>
              <p className="ws-card-body">
                The fake STT provider is processing the demo Kannada fixture. Polling every 3 seconds…
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
                The provider transcript is shown below. Make corrections before creating an administrative draft.
                The original provider version is always preserved — this creates a new revision.
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
                <button className="button-primary ws-action" onClick={() => { saveTranscriptRevision(); createDraft(); }} disabled={state.loading} type="button" id="ws-create-draft">
                  {state.loading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
                  {state.loading ? "Creating draft…" : "Save & create admin draft"}
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
                <span>Administrative flag only · Not a clinical assessment · ANM review required before any action</span>
              </div>

              {isASHA && (
                <div className="ws-actions">
                  <div className="ws-field">
                    <label htmlFor="ws-worker-note">Optional worker note (for ANM)</label>
                    <input id="ws-worker-note" type="text" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Any context for the ANM reviewer" />
                  </div>
                  <button className="button-primary ws-action" onClick={submitForReview} disabled={state.loading} type="button" id="ws-submit-review">
                    <ChevronRight size={15} /> Submit for ANM review
                  </button>
                </div>
              )}

              {isANM && (
                <div className="ws-actions ws-anm-actions">
                  <button className="ws-confirm-btn" onClick={confirmDraft} disabled={state.loading} type="button" id="ws-confirm-draft">
                    <CheckCircle size={15} /> Confirm &amp; create task
                  </button>
                  <div className="ws-field">
                    <label htmlFor="ws-dismiss-reason">Dismissal reason (required to dismiss)</label>
                    <input id="ws-dismiss-reason" type="text" value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} placeholder="Reason for dismissal" />
                  </div>
                  <button className="ws-dismiss-btn" onClick={dismissDraft} disabled={state.loading || !dismissReason} type="button" id="ws-dismiss-draft">
                    <XCircle size={15} /> Dismiss
                  </button>
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
                The draft is now in the ANM review queue. No message has been sent. Sign in as <code>anm.demo</code> to confirm, revise, or dismiss it.
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
                <div><span>Due</span><strong>{new Date(state.task.due_at).toLocaleDateString("en-IN")}</strong></div>
                <div><span>Confirmed</span><strong>{new Date(state.task.confirmed_at).toLocaleString("en-IN")}</strong></div>
              </div>
              <div className="ws-safety-bar">
                <ShieldCheck size={13} />
                <span>No automated messages sent · Task visible to assigned owner · Human action required</span>
              </div>
              <button className="button-primary ws-action" onClick={completeTask} disabled={state.loading} type="button" id="ws-complete-task">
                <CheckCircle size={15} /> Acknowledge &amp; complete task (demo)
              </button>
            </div>
          )}

          {/* ── TASK DONE ─────────────────────────────────────────────── */}
          {state.step === "task_done" && (
            <div className="ws-card ws-card-confirmed">
              <div className="ws-card-label"><CheckCircle size={14} /> Task completed</div>
              <h2 className="ws-card-heading">Follow-up<br /><em>logged.</em></h2>
              <p className="ws-card-body">
                The full workflow has been completed. Every step is recorded in the audit log. No automated message was sent at any point.
              </p>
              <div className="ws-safety-bar ws-safety-confirmed">
                <CheckCircle size={13} />
                <span>Workflow complete · Audit trail created · No automated messaging</span>
              </div>
              <button className="button-text ws-action" onClick={reset} type="button">
                <RefreshCw size={15} /> Run the demo flow again
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
