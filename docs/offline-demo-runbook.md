# MaatruMitra — Offline Field Simulation & Conflict Handling Runbook

> **PROTOTYPE FIELD SIMULATION ONLY**  
> Demonstrates offline queueing, optimistic concurrency control (OCC), background synchronization, and supervisory conflict reconciliation using synthetic data.

---

## 1. Prerequisites & Environment Reset

Before beginning the demonstration, ensure the backend server and client are running and the database is in a clean state:

```bash
# Terminal 1: Start backend server
pnpm dev:server

# Terminal 2: Start frontend client
pnpm dev

# Terminal 3 (or browser): Reset database to clean baseline
pnpm db:reset
```

Open `http://localhost:5173/login` in your browser.

---

## 2. Seeded Test Identities

| Role | Username | Password | Jurisdiction | Primary Scenario Role |
|---|---|---|---|---|
| **ASHA Worker** | `asha.demo` | `AshaDemoPass123!` | Ward 03, Chitradurga | Records field notes offline; edits transcripts |
| **ANM Reviewer** | `anm.demo` | `AnmDemoPass123!` | Ward 03, Chitradurga | Supervisory area review; resolves stale conflicts |
| **PHC Admin** | `admin.demo` | `AdminDemoPass123!` | PHC Malladihalli | Operational reporting; system reset |

---

## 3. Scenario A: Offline Field Draft Creation & Reconnection Sync

### Step 1: Simulate Offline Field Environment
1. Sign in as `asha.demo` / `AshaDemoPass123!`.
2. Locate the **Offline Queue & Network Status** bar at the top of the workspace.
3. Check **Simulate Offline**.
   - The status pill immediately turns to `OFFLINE — Simulation Active`.
   - The network connection is simulated as disconnected without disabling your actual browser internet.

### Step 2: Record Field Note in Offline Mode
1. Click **Start ASHA demo flow**.
2. Notice that the draft is created locally in IndexedDB / local queue:
   - Status badge shows `[LOCAL DRAFT]`.
   - The queue counter displays `Queue: 1 item (1 pending)`.
3. Review the Kannada transcript text:
   - Edit the text in the editor (e.g. modify visit notes).
   - Click **Save edited revision**.
4. The queue increments to record the pending transcript revision and follow-up draft intent (`[QUEUED]`).

### Step 3: Reconnect and Synchronize
1. Uncheck **Simulate Offline** (or click **Sync Now (X pending)**).
2. The network pill transitions to `ONLINE — Server Connected`.
3. The queue items automatically synchronize with the server:
   - Status transitions from `[SYNCING]` to `[SYNCED]`.
   - The server applies each idempotent action and assigns authoritative entity IDs and `server_version = 1`.
4. Click **Clear Synced** to clear completed queue records.

---

## 4. Scenario B: Optimistic Concurrency Control (OCC) & Conflict Resolution

This scenario demonstrates how MaatruMitra prevents race conditions and protects supervisory decisions when an ASHA worker submits a draft based on an outdated server version.

### Step 1: Establish Base Version
1. Complete Scenario A so that a draft exists on the server with `server_version = 1` in state `AWAITING_ANM_REVIEW`.

### Step 2: ANM Modifies the Server Draft (Increments Server Version)
1. In a private/incognito window (or after signing out), sign in as `anm.demo` / `AnmDemoPass123!`.
2. Under **Area Review Queue**, open the draft.
3. Click **Revise draft details**, update the observation summary to *"ANM revised: Priority IFA counseling required"*, enter a reviewer note, and click **Submit revision (REVISED)**.
4. The server increments `server_version` from `1` to `2`.

### Step 3: ASHA Attempts an Offline Update with Stale Base Version (v1)
1. In the ASHA session window, check **Simulate Offline**.
2. Modify the draft summary or transcript locally with a base version of `v1`.
3. Uncheck **Simulate Offline** to trigger synchronization.
4. The server detects `base_server_version (1) < current_server_version (2)` and rejects the automatic merge with error code `STALE_BASE_VERSION`.
5. The queue item marks state `[CONFLICT]`.

### Step 4: Authoritative Conflict Review
1. Click **Review Conflict** on the conflicting queue item.
2. The **Conflict Review & Reconciliation Modal** opens displaying:
   - **Local Version (Stale Base v1)** vs. **Server Version (Authoritative v2)**.
   - Timestamps, actor names, and administrative attributes.
3. **Role Isolation Check**:
   - If signed in as ASHA, observe the safety notice: *ANM supervisory decisions cannot be overwritten by field worker role*.
   - Switch to ANM session (`anm.demo`), open the conflict review modal, and select **Keep Server Version** or **Manual Reconcile**.
4. Click **Resolve Conflict**:
   - The resolution is applied authoritatively on the server.
   - An immutable `CONFLICT_RESOLVED` audit event is written to the audit log.
   - The queue item status updates to `[RESOLVED]`.

---

## 5. Scenario C: Low-Bandwidth Mode Verification

1. In the status bar, check **Low-Bandwidth Mode**.
2. Verify field-readiness behavior:
   - Simulated audio waveforms stop continuous keyframe animations.
   - Background polling is paused.
   - Touch targets remain $\ge 44\text{px}$ for mobile fieldwork.
3. Refresh the page and confirm that `maatrumitra_low_bandwidth` state persists in `localStorage`.
