# MaatruMitra — Local Development Setup

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 LTS |
| pnpm | ≥ 10 |
| OS | Windows / macOS / Linux |

---

## 1. Clone and install

```bash
git clone <repo-url> maatrumitra
cd maatrumitra
pnpm install
```

---

## 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env`. For local development, the defaults work. The only values you must change before any real deployment:

- `JWT_ACCESS_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `JWT_REFRESH_SECRET` — a different 64-byte hex string

---

## 3. Database

```bash
# Create tables (safe to re-run — applies only new migrations)
pnpm db:migrate

# Seed synthetic demo data
pnpm db:seed
```

The seed command prints demo credentials at the end:

```
ASHA_WORKER      asha.demo / AshaDemoPass123!
ANM_REVIEWER     anm.demo / AnmDemoPass123!
PHC_ADMIN        admin.demo / AdminDemoPass123!
```

> These are fictional identities for demonstration only.

---

## 4. Run the development server

The Vite dev server (port 5173) proxies `/api` requests to the Express server (port 3000).

```bash
# Terminal 1 — Express API + job runner
pnpm dev:server

# Terminal 2 — Vite frontend HMR
pnpm dev
```

Or run both concurrently (if you install `concurrently`):
```bash
npx concurrently "pnpm dev:server" "pnpm dev"
```

---

## 5. Demo workflow

1. Open `http://localhost:5173/login`
2. Sign in as `asha.demo`
3. Navigate to `/workspace`
4. Click **Start ASHA demo flow** — this creates a voice note, submits it for transcription, and polls for the transcript (fake provider, ~15 seconds)
5. The transcript appears (demo Kannada fixture). Review and click **Save & create admin draft**
6. Review the draft and click **Submit for ANM review**
7. Log out, sign in as `anm.demo`, go to `/workspace`
8. See the draft in AWAITING_ANM_REVIEW state
9. Confirm → a follow-up task is created (no SMS/WhatsApp is sent)
10. Log out, sign in as `asha.demo` again, acknowledge and complete the task

---

## 6. Run tests

```bash
# Unit + integration tests (server-side only, no browser)
pnpm test

# Watch mode
pnpm test:watch
```

---

## 7. Reset the database

```bash
# Drops all tables and re-runs all migrations + seed
pnpm db:reset
```

---

## Directory structure

```
maatrumitra/
├── client/            # React/Vite frontend
│   └── src/
│       ├── pages/     # Home, Login, Workspace
│       ├── hooks/     # useAuth
│       └── lib/       # api.ts (typed API client)
├── server/            # Express backend
│   ├── db/            # migrations, migrate.ts, seed.ts, client.ts
│   ├── repositories/  # one file per DB entity
│   ├── services/      # business logic (stateMachine, auth, extraction, …)
│   ├── providers/     # extraction and storage provider abstractions
│   ├── middleware/    # auth, validate, rateLimit, errorHandler
│   ├── routes/        # one router per resource
│   ├── jobs/          # runner + job handlers
│   └── tests/         # vitest test suite
├── shared/            # roles.ts, states.ts, schemas.ts
├── docs/              # API contract, data flow, gap list
└── uploads/           # local audio file storage (git-ignored)
```
