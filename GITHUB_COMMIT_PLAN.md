# MaatruMitra — Professional GitHub and Local Workflow

This project is ready to be pushed to a repository, but the right objective is **high-quality commit history**, not a large number of meaningless commits. Each commit should be independently understandable and easy to review.

| Order | Commit message | Scope |
|---|---|---|
| 1 | `chore: initialize MaatruMitra frontend scaffold` | Base React/Vite project, config, and ignore rules. |
| 2 | `docs: define MaatruMitra product safety and research brief` | `PROJECT_BRIEF.md`, `ideas.md`, and the Antigravity prompt. |
| 3 | `feat: build orbiting care landing page` | Hero, product narrative sections, responsive layout, and branded asset integration. |
| 4 | `feat: add staged human-confirmed follow-up demo` | Voice note → task card → confirmation UI state. |
| 5 | `style: refine field-ready motion and responsive behavior` | Motion, reduced-motion handling, mobile UX, and visual polish. |
| 6 | `docs: add professional development and GitHub handoff` | This file, README, tests, and future-work notes. |

## Local Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

## Before Every Commit

```bash
git status
git diff --check
pnpm check
pnpm build
git add <only the intended files>
git commit -m "type: concise reviewable change"
```

## Before Pushing to GitHub

Confirm that no secrets, real health data, raw audio, transcripts, user-exported files, local `.env` files, or build output are included. Use a private repository if any prototype artifact contains even anonymized operational data. The frontend in this repository is intentionally demo-only; it must remain so unless governance, consent, and secure backend work are added.
