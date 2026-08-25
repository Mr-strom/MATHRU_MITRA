# MaatruMitra — What Is Not Yet Implemented

This document is the honest gap list. It is part of the repository so that any engineer or product stakeholder can see exactly what exists and what does not, before building on top of this prototype.

> **PROTOTYPE** — No live patient data. No real ASHA or ANM credentials. For demonstration and architectural review only.

---

## Authentication & Authorization

| Item | Status |
|---|---|
| External auth (NHA/eKYC/AADHAAR) | ❌ Not implemented — local bcrypt passwords only |
| 2FA / OTP login | ❌ Not implemented |
| Token rotation audit (revoke all on suspicious activity) | ✅ Partial — `revokeAllUserTokens` exists, not triggered automatically |
| User provisioning UI (admin creates ASHA accounts) | ❌ Not implemented |
| Password reset flow | ❌ Not implemented |

---

## Voice / Audio

| Item | Status |
|---|---|
| Real STT provider (Kannada) | ❌ Not implemented — fake STT returns fixture text |
| Client-side audio recording (MediaRecorder API) | ❌ Not implemented — frontend only demos with hardcoded fixture |
| Audio format validation (server-side) | ✅ MIME type + size validated |
| Chunked upload for large files | ❌ Not implemented |
| Audio waveform display | ❌ Not implemented |

---

## Extraction / NLP

| Item | Status |
|---|---|
| Real LLM/NLP extraction provider | ❌ Not implemented — FakeExtractionProvider only |
| Kannada-specific entity extraction | ❌ Not implemented |
| Multi-turn voice note (session) | ❌ Not implemented |
| Extraction confidence score display | ✅ Partial — field exists, fake value returned |

---

## Notifications

| Item | Status |
|---|---|
| SMS notifications | ❌ Intentionally disabled — notification_outbox.status is always DISABLED |
| WhatsApp notifications | ❌ Intentionally disabled |
| Push notifications | ❌ Not implemented |
| In-app notification bell | ❌ Not implemented |

> **SAFETY NOTE**: Notifications are not just "not implemented" — they are **architecturally blocked**. The notification_outbox table has a CHECK constraint that only permits `status = 'DISABLED'`. Any future notification feature requires explicit governance review and approval before the constraint is lifted.

---

## Frontend / UX

| Item | Status |
|---|---|
| Beneficiary reference selector (real list from DB) | ❌ Not implemented — workspace uses demo fixture ID |
| Task due-date picker | ❌ Not implemented — hardcoded to +2 days in demo |
| ANM review queue (paginated list) | ❌ Not implemented — workspace shows single demo flow |
| Audit history view | ❌ Not implemented — data exists in DB, no UI |
| Offline / PWA support | ❌ Not implemented |
| Kannada UI labels | ✅ Partial — transcript is in Kannada, UI is in English |
| Accessibility audit | ❌ Not performed — ARIA roles and labels are present but not audited |

---

## Data & Privacy

| Item | Status |
|---|---|
| Data retention enforcement (scheduled deletion) | ❌ Not implemented — `data_retention_until` column exists, no job runs against it |
| DPDP Act compliance review | ❌ Not performed |
| Consent withdrawal flow | ❌ Not implemented — consent_status column exists |
| Encryption at rest | ❌ Not implemented — SQLite file is not encrypted |
| Audit log export (CSV/PDF) | ❌ Not implemented |

---

## Infrastructure

| Item | Status |
|---|---|
| PostgreSQL adapter | ❌ Not implemented — SQLite only (repository layer is abstracted) |
| S3/GCS storage provider | ❌ Not implemented — LocalFsStorageProvider only |
| Production Docker image | ❌ Not implemented |
| CI/CD pipeline | ❌ Not implemented |
| Health check monitoring | ✅ `/api/health` endpoint exists |
| Structured logging (pino) | ✅ Dependency installed, not wired to routes yet |
| Error tracking (Sentry or equivalent) | ❌ Not implemented |

---

## Testing

| Item | Status |
|---|---|
| State machine unit tests | ✅ Implemented |
| Extraction safety tests | ✅ Implemented |
| Auth service tests | ✅ Implemented |
| Workflow integration tests | ✅ Implemented |
| Data minimization tests | ✅ Implemented |
| HTTP integration tests (supertest) | ❌ Not implemented |
| Frontend component tests | ❌ Not implemented |
| E2E tests (Playwright) | ❌ Not implemented |
| Load / performance tests | ❌ Not implemented |

---

## Before Any Real Deployment

The following items **must** be completed before MaatruMitra is used with real ASHA worker accounts or real beneficiary data:

1. **Replace fake STT and extraction providers** with real, Kannada-capable providers reviewed by the product team.
2. **Complete DPDP Act compliance review** with legal counsel.
3. **Obtain governance approval** before enabling any notification channel in `notification_outbox`.
4. **Encrypt the SQLite file** or migrate to a production-grade database with encryption at rest.
5. **Implement real auth** — NHA/eKYC or equivalent, with 2FA.
6. **Conduct an accessibility audit** against WCAG 2.1 AA.
7. **Implement data retention enforcement** against `data_retention_until`.
8. **Add a consent withdrawal flow** that deletes associated voice notes, transcripts, and drafts.
9. **Conduct a security penetration test.**
10. **Clinical safety review** — ensure no extraction output can leak clinical content into the UI, even via adversarial prompt injection.
