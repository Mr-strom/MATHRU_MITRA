# MaatruMitra — Synthetic Demo Runbook

> **PROTOTYPE DEMONSTRATION ONLY**  
> All records, audio files, beneficiary references, and credentials used in this runbook are visibly synthetic fixtures. This system does not access live health registries (RCH), does not diagnose or prescribe, and does not send SMS/WhatsApp messages.

---

## 1. Quick Setup

Ensure you have **Node.js 24+** and **pnpm** installed.

```bash
# 1. Clone & install dependencies
pnpm install

# 2. Configure local environment (if not already done)
cp .env.example .env

# 3. Reset & seed synthetic demo database
pnpm db:reset
```

---

## 2. Starting the Application (Dual Terminals)

Open two terminal windows in the project root:

### Terminal 1: Backend API Server
```bash
pnpm dev:server
```
*Starts the Express backend on `http://localhost:3000` (or `PORT=3001` if specified in `.env`), runs idempotent SQLite migrations, and initializes the in-memory background job queue.*

### Terminal 2: Frontend Client
```bash
pnpm dev
```
*Starts the Vite dev server on `http://localhost:5173`. Open this URL in your web browser.*

---

## 3. Seeded Synthetic Credentials

| Role | Username | Password | Assigned Area | Purpose in Demo |
|---|---|---|---|---|
| **ASHA Worker** | `asha.demo` | `AshaDemoPass123!` | Ward 03, Chitradurga | Records note, reviews transcript, generates draft, completes assigned task |
| **ANM Reviewer** | `anm.demo` | `AnmDemoPass123!` | Ward 03, Chitradurga | Reviews area drafts, assigns ASHA task owner, confirms / revises / dismisses |
| **PHC Admin** | `admin.demo` | `AdminDemoPass123!` | PHC Malladihalli | Cross-area oversight and demo environment reset capability |

---

## 4. End-to-End Demonstration Walkthrough

### Phase 1: ASHA Field Follow-up Recording & Draft Creation
1. Navigate to `http://localhost:5173/login`.
2. Sign in with `asha.demo` / `AshaDemoPass123!`.
3. In the Workspace, check the **Demo Checklist** toggle in the sidebar:
   - Verify `API: ready`, `Schema: ready`, `Fake Providers: active`, `Demo Fixture: ready`, and `Outbox: DISABLED`.
4. Click **Start ASHA demo flow**.
   - The app verifies consent, loads synthetic beneficiary reference `BEN-DEMO-001`, and uploads a synthetic audio container.
5. **Transcript Review**:
   - The fake STT provider produces a Kannada draft transcript (*"ಗರ್ಭಿಣಿ ತಪಾಸಣೆ ವೇಳೆ ಐರನ್ ಮಾತ್ರೆ ಸೇವನೆ ನಿಲ್ಲಿಸಿರುವುದು ಕಂಡುಬಂದಿದೆ..."*).
   - In the editable text box, make a correction (e.g., adding an administrative observation) and click **Save edited revision**.
6. **Administrative Draft**:
   - Click **Create draft from revision**.
   - The non-diagnostic extraction engine maps the note to administrative category `IFA_SUPPLEMENT_FOLLOW_UP` and retrieves Karnataka RMNCH+A SOP Section 4.2 citation.
7. **Worker Review**:
   - Click **Mark reviewed & ready for ANM**.
   - Click **Submit to ANM queue**. The draft transitions to `AWAITING_ANM_REVIEW`.
8. Click **Sign out**.

---

### Phase 2: ANM Area Queue Review & Task Assignment
1. Sign in with `anm.demo` / `AnmDemoPass123!`.
2. Under **Area Review Queue**, click the draft in `AWAITING_ANM_REVIEW`.
3. Select an assignable area ASHA owner from the dropdown (defaults to `Asha Lakshmi (Demo Worker)`).
4. Review the three operational choices:
   - **Path A (Confirm)**: Enter an optional reviewer note and click **Confirm follow-up (CONFIRMED)**. This confirms the draft and creates a single `TASK_OPEN` task for the selected ASHA.
   - **Path B (Revise)**: Toggle **Revise draft details**, adjust summary or due date, enter a reviewer note, and submit **(REVISED)**.
   - **Path C (Dismiss)**: Enter a required dismissal reason (e.g. *"Duplicate household visit"*) and click **Dismiss**.
5. For the standard happy path, execute **Path A (Confirm)**.
6. Click **Sign out**.

---

### Phase 3: ASHA Task Completion & Audit Trail
1. Sign in again with `asha.demo` / `AshaDemoPass123!`.
2. The active task card displays `TASK_OPEN` assigned to the worker.
3. Click **Acknowledge & complete task**.
   - The task transitions: `TASK_OPEN` → `TASK_ACKNOWLEDGED` → `TASK_COMPLETED`.
4. Expand the **Audit Trail** drawer:
   - Observe the complete, chronological history of state transitions.
   - Confirm that all payloads are sanitized and no clinical diagnoses, raw audio paths, or patient identifiers are exposed.

---

## 5. Demo Reset Instructions

To reset the demo to its clean initial state between presentations:

### Option A: From Web UI (Recommended for Live Demos)
1. Sign in as `admin.demo` / `AdminDemoPass123!`.
2. In the sidebar rail, click **Reset Demo Data & Storage**.
3. Confirm the dialog. All tables are dropped, re-migrated, re-seeded, and temporary uploaded test audio files are deleted.

### Option B: From Command Line
```bash
pnpm db:reset
```

---

## 6. Expected Visible States

| Workflow Step | Draft / Task State | Expected UI Elements |
|---|---|---|
| Initial | `idle` | "Begin with a Kannada field note", Demo Checklist |
| Audio Attached | `VOICE_NOTE_DRAFT` | Audio player, beneficiary reference tag `BEN-DEMO-001` |
| STT Complete | `TRANSCRIPT_READY` | Editable Kannada transcript box, Save revision button |
| Draft Formed | `WORKER_REVIEWED` | Category badge, SOP Section 4.2 citation, Submit button |
| ANM Review | `AWAITING_ANM_REVIEW` | ANM queue card, ASHA owner selector, Confirm/Revise/Dismiss |
| Task Created | `TASK_OPEN` | Assigned owner, due date, Acknowledge button |
| Task Done | `TASK_COMPLETED` | Green completion banner, Audit Trail drawer |

---

## 7. Troubleshooting Matrix

| Issue | Root Cause | Solution |
|---|---|---|
| `PORT 3000 in use` | Another process is occupying port 3000 | Set `PORT=3001` in `.env` and restart `pnpm dev:server`. |
| `HTTP 401 Unauthorized` | Expired or missing session cookie | Sign in again via `/login`. |
| `HTTP 403 Access Denied` | ANM reviewing draft from different area | Use `anm.demo` (assigned to Ward 03, matching `BEN-DEMO-001`). |
| `Database unmigrated` | Migrations missing on initial run | Execute `pnpm db:reset`. |
| `Audio not attached` | Submitting voice note before file upload completes | Ensure file upload request finishes before submission. |
| `Audit events missing` | Database was reset mid-session | Run demo from Phase 1 to generate fresh audit entries. |
