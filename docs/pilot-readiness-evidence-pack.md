# MaatruMitra — Pilot-Readiness Evidence Pack

> **EVIDENCE & VERIFICATION ARTIFACT FOR TECHNICAL MENTORS & ETHICS REVIEWERS**  
> **Repository**: `Mr-strom/MATHRU_MITRA`  
> **Status**: Prototype Validation Milestone Completed  
> **Product Scope**: Kannada-first, human-confirmed administrative maternal follow-up coordination for Karnataka ASHA/ANM health workers.

---

## 1. Synthetic Scenario Reset & Fixture Specification

MaatruMitra operates exclusively with synthetic, developer-controlled test fixtures to prevent accidental contamination of real patient data.

### 1.1 Synthetic Fixtures Description

| Fixture Key | Entity Type | Data Content | Purpose |
|---|---|---|---|
| `BEN-DEMO-001` | Beneficiary Reference | Fictional identifier (Chitradurga Ward 03) | Represents anonymized beneficiary reference ID for follow-up note linkage |
| `SOP-KA-RMNCHA-2024-V2` | Standard Operating Procedure | Karnataka RMNCH+A Operational Guidelines (ASHA Field Follow-Up) | Authoritative reference document for administrative follow-up categorization |
| `demo-sop-exc-001` | SOP Excerpt | Section 4.2: IFA Supplement Routine Home Visit Follow-Up | SOP citation attached to iron-folic acid follow-up drafts |
| `demo-sop-exc-002` | SOP Excerpt | Section 2.1: Missed ANC Home Visit Follow-Up Protocol | SOP citation attached to antenatal checkup follow-up drafts |
| `asha.demo` | User / Worker | Role: `ASHA_WORKER`, Area: `Ward 03, Chitradurga` | Field note recording, transcript review, task completion |
| `anm.demo` | User / Supervisor | Role: `ANM_REVIEWER`, Area: `Ward 03, Chitradurga` | Area queue supervisory review, task assignment, conflict resolution |
| `admin.demo` | User / Facility Admin | Role: `PHC_ADMIN`, Facility: `PHC Malladihalli` | Operational metrics monitoring, sanitized report export, demo reset |

### 1.2 Reset Tooling

Two deterministic reset mechanisms restore the system to a clean baseline:

1. **CLI Reset Command**:
   ```bash
   pnpm db:reset
   ```
   *Executes `server/db/migrate.ts --reset` and `server/db/seed.ts`. Drops all SQLite tables, reapplies migrations 001–004, and re-seeds synthetic fixtures.*

2. **Development-Only Admin Endpoint**:
   ```http
   POST /api/v1/admin/demo-reset
   Authorization: Bearer <PHC_ADMIN_TOKEN>
   ```
   *Resets in-memory queues and database fixtures. In production (`NODE_ENV=production`), this endpoint is hard-blocked and returns `409 Conflict` (`Demo reset is only available in development environment`).*

---

## 2. Data-Retention and Deletion Verification Checklist

MaatruMitra adheres to strict data minimization and non-diagnostic administrative boundaries.

| Check # | Safety & Privacy Verification Item | Implementation Evidence | Verification Status |
|---|---|---|---|
| **DR-01** | **Zero Live Health Records (RCH/ABDM)** | Beneficiary records contain only synthetic reference strings (`BEN-DEMO-001`). No names, phone numbers, Aadhaar numbers, or addresses exist in the database schema. | **VERIFIED** |
| **DR-02** | **Audio Storage Minimization** | Audio upload generates synthetic mock blobs. Raw audio storage keys (`test-asha-001/audio_xyz.webm`) are never exposed in public API responses or operational export files. | **VERIFIED** |
| **DR-03** | **Immutable Audit Redaction** | `audit_events` stores structured metadata (`previous_state`, `next_state`, `actor_user_id`). Sensitive fields and raw transcript texts are strictly scrubbed prior to audit persistence. | **VERIFIED** |
| **DR-04** | **Notification Outbox Safety Lock** | `notification_outbox` table enforces SQLite check constraint `CHECK (status = 'DISABLED')`. No automated SMS or WhatsApp messages can ever be dispatched. | **VERIFIED** |
| **DR-05** | **Password Hash Sanitization** | `users` table passwords are encrypted via `bcrypt` (10 rounds). User DTOs strictly omit `password_hash` in all JSON serializations (`SafeUserSchema`). | **VERIFIED** |
| **DR-06** | **Session Token Invalidation** | Refresh tokens are tracked in `refresh_tokens` table. User logout invalidates the token family immediately. | **VERIFIED** |

---

## 3. Audit-Event Export Example with Redaction Proof

The PHC-Admin Supervisor Reporting engine (`server/services/reporting.service.ts`) provides sanitized exports with proven zero raw Kannada transcript text, zero audio storage paths, and zero patient identifiers.

### 3.1 CSV Export Format Evidence

```csv
================================================================================
MAATRUMITRA — OPERATIONAL SUPERVISOR REPORT
Generated At: 2026-08-28T06:20:00.000Z
Facility / Jurisdiction Scope: ALL AREAS (Global PHC Admin)
Safety Notice: Synthetic operational administrative metrics only. Contains zero clinical risk rankings, zero diagnostic predictions, and zero patient health data.
================================================================================

--- KEY OPERATIONAL METRICS ---
Metric,Value
Drafts Awaiting ANM Review,3
Confirmed Tasks (Total),12
Confirmed Tasks (Open),4
Confirmed Tasks (Acknowledged),3
Confirmed Tasks (Completed),4
Confirmed Tasks (Overdue),1
Median Turnaround Time (Submission to Decision),28.5 minutes
Total Offline Synced Actions,19
Offline Sync Applied,16
Offline Sync Conflicts Detected,2
Offline Sync Conflicts Resolved,2
Offline Sync Failures,1

--- CONFIRMED TASKS PIPELINE ---
Status Category,Task Count,Proportion of Pipeline
Open (On Schedule),3,25.0%
Acknowledged,3,25.0%
Completed,4,33.3%
Overdue (Past Administrative Due Date),1,8.3%
Total Confirmed Tasks,12,100%

--- OFFLINE SYNC & CONCURRENCY HEALTH ---
Action Outcome,Count,Reliability Percentage
Applied Automatically,16,84.2%
Conflicts Reconciled,2,10.5%
Sync Failures,1,5.3%
Total Synced Actions,19,100%

--- AREA ACTIVITY BREAKDOWN ---
Area ID,District,Taluk,Facility Name,Ward / Village,Drafts Count,Tasks Count,Active Workers
test-area-001,Chitradurga,Chitradurga Urban,Chitradurga PHC,Ward 03,2,8,2
test-area-002,Chitradurga,Chitradurga Rural,Rural PHC,Ward 02,1,4,1

--- ROLE ACTIVITY VOLUME ---
Role,Action Count,Percentage of Activity
ASHA_WORKER,14,53.8%
ANM_REVIEWER,9,34.6%
PHC_ADMIN,3,11.5%
Total Recorded Audit Events,26,100%
```

### 3.2 Redaction Verification Proof
- **No Kannada Transcripts**: Checked against string `ಗರ್ಭಿಣಿ` $\rightarrow$ **0 matches**.
- **No Audio Keys**: Checked against file extension `.webm` or `storage_key` $\rightarrow$ **0 matches**.
- **No Sensitive Tokens**: Checked against `password_hash` or `token` $\rightarrow$ **0 matches**.

---

## 4. Mentor Review Checklist

| Milestone Area | Architectural Requirement | Verification Mechanism | Status |
|---|---|---|---|
| **Boundary Control** | Strict administrative categorization; no clinical diagnosis, drug prescribing, or automated triage | SOP taxonomy (`shared/schemas.ts`); non-diagnostic extraction engine | **PASS** |
| **Separation of Duties** | ASHA workers cannot confirm/dismiss drafts; ANM reviewers cannot act on drafts outside their area | Role & area route guards (`requireRole`, `requireArea`) | **PASS** |
| **Offline Sync Integrity** | Client queue stores drafts locally; server applies idempotent sync with monotonic version tracking | `003_sync_actions.sql`, `004_optimistic_concurrency.sql`, `sync.service.ts` | **PASS** |
| **Concurrency & OCC** | Reject stale base versions; require supervisory human resolution for conflicting drafts | `conflictHandling.test.ts`, `ConflictReviewModal.tsx` | **PASS** |
| **Supervisor Reporting** | Operational throughput only (overdue tasks, turnaround time, sync reliability, volume by role) | `reporting.repo.ts`, `supervisorReporting.test.ts` | **PASS** |
| **Accessibility (a11y)** | Visible focus, ARIA live region announcements, keyboard tab order, skip link, 44px mobile touch targets | `index.css`, `Workspace.tsx`, WCAG 2.1 AA parity | **PASS** |
| **Low-Bandwidth Mode** | Disables animated waveforms, stops polling, minimizes data transfer for rural network conditions | `useNetworkStatus.ts`, `OfflineQueuePanel.tsx` | **PASS** |
| **Automated Testing** | Full integration test coverage across all administrative workflows | 11 test suites, 84 integration tests passing | **PASS** |

---

## 5. Known Limitations & Strict Safety Boundaries

The MaatruMitra prototype is designed as an administrative follow-up coordination concept. The following operational boundaries are intentionally enforced:

1. **No Real Kannada STT Provider**:
   - The current transcription layer uses a deterministic mock STT provider (`fake-kannada-stt`).
   - Production speech-to-text integration (e.g. AI4Bharat / Bhashini) is not implemented in this prototype.

2. **No Real Patient or Health Registry Data**:
   - All identities, beneficiary references, and visit logs are synthetic fixtures.
   - The system is not connected to any government health databases (e.g., Reproductive and Child Health portal - RCH, Ayushman Bharat Digital Mission - ABDM).

3. **No Automated Beneficiary Messaging**:
   - The notification outbox is locked at the database level (`CHECK (status = 'DISABLED')`).
   - The system never dispatches direct SMS, WhatsApp, or voice notifications to beneficiaries.

4. **No Clinical Diagnostic Validation**:
   - MaatruMitra is not a medical device, clinical decision support system, or emergency triage service.
   - All follow-up tasks represent administrative field visits (e.g. routine nutrition counseling, follow-up scheduling) based on published Karnataka RMNCH+A SOPs.

5. **No Production Deployment Approval**:
   - This software is a functional prototype built for demonstration, technical mentor evaluation, and workflow usability testing.
   - It is not authorized for deployment in live clinical environments without formal institutional review and ethics approval.
