# MaatruMitra

**Every mother, remembered.** A Kannada-first maternal follow-up intelligence concept for ASHA and ANM teams in Karnataka.

This repository currently contains an **animated frontend starter** and a staged product demonstration. It illustrates a safe administrative flow from field voice note to human-confirmed follow-up. It does not use live patient data, diagnose, prescribe, or connect to external health systems.

## Run Locally

```bash
pnpm install
pnpm dev
```

## Validate

```bash
pnpm check
pnpm build
```

## Project Documents

| File | Purpose |
|---|---|
| [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) | Research, competitor context, differentiators, safety model, and recommended roadmap. |
| [`ideas.md`](./ideas.md) | Chosen visual philosophy and interaction design system. |
| [`ANTIGRAVITY_PROMPT.md`](./ANTIGRAVITY_PROMPT.md) | Reusable starting prompt for future Antigravity sessions. |
| [`GITHUB_COMMIT_PLAN.md`](./GITHUB_COMMIT_PLAN.md) | Professional GitHub/local workflow and suggested commit sequence. |

## Product Boundary

MaatruMitra is designed as a **human-led administrative coordination tool**. It must not make autonomous clinical decisions, provide prescriptions, or send actions without an authorized confirmation step.

