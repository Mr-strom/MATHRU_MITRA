# MaatruMitra — Backend Architecture Reference

## What was built

A safe, layered Express + SQLite backend for the MaatruMitra administrative coordination workflow. It is connected to the existing React/Vite frontend via a typed API client. The landing page is completely unchanged.

---

## Architecture at a glance

```
client/src/
├── pages/
│   ├── Home.tsx         ← Original landing (untouched)
│   ├── Login.tsx        ← New: /login route
│   └── Workspace.tsx    ← New: /workspace authenticated demo
├── hooks/useAuth.ts     ← AuthProvider + useAuth hook
└── lib/api.ts           ← Typed fetch wrapper for all API resources

server/
├── index.ts             ← HTTP server entry (runs migrations, starts job runner)
├── app.ts               ← Express app factory (imported by tests without starting server)
├── db/
│   ├── client.ts        ← SQLite singleton (better-sqlite3, WAL mode)
│   ├── migrations/      ← SQL migration files (applied in lexicographic order)
│   ├── migrate.ts       ← Migration runner (pnpm db:migrate)
│   └── seed.ts          ← Synthetic dev data (pnpm db:seed)
├── repositories/        ← One file per DB entity, all SQL lives here
├── services/
│   ├── errors.ts        ← Typed error classes → HTTP status mapping
│   ├── stateMachine.ts  ← Transition validation + audit event emission
│   ├── auth.service.ts  ← JWT access + bcrypt refresh tokens
│   ├── voiceNote.service.ts
│   ├── transcript.service.ts
│   ├── extraction.service.ts   ← Clinical term blocklist enforcement
│   ├── reviewWorkflow.service.ts
│   ├── sopCitation.service.ts
│   └── auditLog.service.ts
├── providers/
│   ├── extraction/      ← ExtractionProvider interface + FakeExtractionProvider
│   └── storage/         ← StorageProvider interface + LocalFsStorageProvider
├── middleware/
│   ├── auth.middleware.ts       ← requireAuth, requireRole, requireAreaAccess
│   ├── validate.middleware.ts   ← Zod schema validation
│   ├── rateLimit.middleware.ts  ← Auth (20/15min) + upload (10/5min) limits
│   └── errorHandler.middleware.ts
├── routes/              ← auth, voiceNotes, followUpDrafts, tasks, sop, audit
├── jobs/
│   ├── runner.ts        ← Polling job runner (15s tick, 3 attempts max)
│   ├── transcriptionJob.ts
│   └── extractionJob.ts
└── tests/
    ├── _setup.ts        ← In-memory DB, migration, seed helpers
    ├── stateMachine.test.ts
    ├── auth.test.ts
    ├── validation.test.ts
    ├── extraction.test.ts
    ├── workflow.test.ts
    └── dataMinimization.test.ts

shared/
├── roles.ts    ← Role constants (ASHA_WORKER, ANM_REVIEWER, PHC_ADMIN, SYSTEM)
├── states.ts   ← State machine transition maps + entity state enums
└── schemas.ts  ← Zod schemas used by both server validation and frontend typing
```

---

## State machine

```
VOICE_NOTE_DRAFT
  ↓ (transcription job completes)
TRANSCRIPT_READY
  ↓ (worker confirms transcript)
WORKER_REVIEWED
  ↓ (worker submits for review)
AWAITING_ANM_REVIEW
  ↓─────────┬──────────┐
CONFIRMED  REVISED  DISMISSED

On CONFIRMED:
  TASK_OPEN
    ↓ (owner acknowledges)
  TASK_ACKNOWLEDGED
    ↓ (owner completes)
  TASK_COMPLETED

  or → TASK_CANCELLED (from TASK_OPEN or TASK_ACKNOWLEDGED)
```

Every transition:
1. Is validated against `DRAFT_TRANSITIONS` / `TASK_TRANSITIONS` maps in `stateMachine.ts`
2. Emits an immutable audit event
3. Is wrapped in a DB transaction

---

## Safety architecture

| Layer | Mechanism |
|---|---|
| Schema | `AdministrativeFollowUpDraft` Zod schema has no clinical fields |
| Service | Clinical term blocklist in `extraction.service.ts` |
| DB | No clinical columns in any table |
| Notification | `notification_outbox.status` has CHECK constraint: `status = 'DISABLED'` only |
| Audit | Every state transition is logged; `safe_payload_json` must not contain raw transcript text |
| Role | ASHA can only view/edit own notes; ANM scoped to area |

---

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Public | Login (rate limited) |
| POST | `/api/v1/auth/logout` | Auth | Revoke tokens |
| POST | `/api/v1/auth/refresh` | Cookie | Refresh access token |
| GET | `/api/v1/me` | Auth | Current user |
| POST | `/api/v1/voice-notes` | ASHA | Create upload intent |
| POST | `/api/v1/voice-notes/:id/submit` | ASHA | Queue for transcription |
| GET | `/api/v1/voice-notes/:id/transcripts` | Auth | Get transcript revisions |
| POST | `/api/v1/voice-notes/:id/transcripts` | ASHA/ANM | Add worker revision |
| POST | `/api/v1/follow-up-drafts/from-transcript` | ASHA/ANM | Create draft via extraction |
| GET | `/api/v1/follow-up-drafts` | Auth | Queue (role-scoped) |
| GET | `/api/v1/follow-up-drafts/:id` | Auth | Draft + audit + citation |
| POST | `/api/v1/follow-up-drafts/:id/submit-review` | ASHA | → AWAITING_ANM_REVIEW |
| POST | `/api/v1/follow-up-drafts/:id/confirm` | ANM/Admin | → CONFIRMED + create task |
| POST | `/api/v1/follow-up-drafts/:id/revise` | ANM/Admin | → REVISED |
| POST | `/api/v1/follow-up-drafts/:id/dismiss` | ANM/Admin | → DISMISSED |
| GET | `/api/v1/tasks` | Auth | Task queue (role-scoped) |
| POST | `/api/v1/tasks/:id/acknowledge` | Owner | → TASK_ACKNOWLEDGED |
| POST | `/api/v1/tasks/:id/complete` | Owner | → TASK_COMPLETED |
| GET | `/api/v1/sop-excerpts/search?q=` | Auth | SOP keyword search |
| GET | `/api/v1/audit-events` | PHC_ADMIN | Audit feed |
| GET | `/api/health` | Public | Health check |

---

## Environment variables

See [`.env.example`](../.env.example) for all variables. Critical before production:
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — must be 64-byte random hex
- `COOKIE_SECURE=true` — require HTTPS-only cookies
- `DATABASE_URL` — point to PostgreSQL for production
- `UPLOAD_DIR` — point to persistent volume

---

## See also

- [`docs/not-yet-implemented.md`](not-yet-implemented.md) — honest gap list
- [`docs/setup-local.md`](setup-local.md) — developer setup guide
