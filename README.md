# MaatruMitra

**Every mother, remembered.** A Kannada-first maternal follow-up intelligence concept for ASHA and ANM teams in Karnataka.

This repository currently contains an **animated frontend starter** and a staged product demonstration. It illustrates a safe administrative flow from field voice note to human-confirmed follow-up. It does not use live patient data, diagnose, prescribe, or connect to external health systems.

## Run Locally (Dual Terminals)

```bash
# 1. Install dependencies & initialize synthetic database
pnpm install
pnpm db:reset

# 2. Terminal 1: Backend API Server
pnpm dev:server

# 3. Terminal 2: Frontend UI
pnpm dev
```

## Validate

```bash
pnpm check      # TypeScript typecheck
pnpm db:reset    # Reset synthetic fixtures
pnpm test        # Vitest integration & unit test suite
pnpm build       # Client and server production builds
```

## Project Documents

| File | Purpose |
|---|---|
| [`docs/demo-runbook.md`](./docs/demo-runbook.md) | **Step-by-step synthetic demo walkthrough, seeded credentials, reset guide, and troubleshooting.** |
| [`docs/security-boundaries.md`](./docs/security-boundaries.md) | **Security architecture, consent model, data minimization, RBAC, and pilot governance prerequisites.** |
| [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) | Research, competitor context, differentiators, safety model, and recommended roadmap. |
| [`ideas.md`](./ideas.md) | Chosen visual philosophy and interaction design system. |
| [`ANTIGRAVITY_PROMPT.md`](./ANTIGRAVITY_PROMPT.md) | Reusable starting prompt for future Antigravity sessions. |
| [`GITHUB_COMMIT_PLAN.md`](./GITHUB_COMMIT_PLAN.md) | Professional GitHub/local workflow and suggested commit sequence. |

## Product Boundary

MaatruMitra is designed as a **human-led administrative coordination tool**. It must not make autonomous clinical decisions, provide prescriptions, or send actions without an authorized confirmation step. All demonstration records use visibly synthetic fixtures.


