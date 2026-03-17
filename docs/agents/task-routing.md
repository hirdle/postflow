# Task Routing

- Purpose: tell agents which docs and code areas to read first for each task class
- Status: implemented
- Primary sources: current repo layout, route/page ownership, repo workflow rules
- Related paths: `project-snapshot.md`, `invariants.md`, `skills.md`
- Update triggers: significant codebase reorganization or new feature areas
- Last reviewed: 2026-03-17

## Routing Table

| Task type | Read first | Then inspect | Main caution |
| --- | --- | --- | --- |
| Backend API change | `../contracts/backend-api.md` | `backend/app/api/`, `backend/app/schemas/`, `backend/app/core/` | Keep frontend contract compatibility explicit |
| Frontend page/UI change | `../contracts/frontend-surface.md` | `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/types/` | Preserve Russian-first UI and manual-save workflow |
| Publish/schedule logic | `../contracts/backend-api.md`, `../workflows/operations.md` | `backend/app/core/publishing/`, `backend/app/infra/` | Status transitions and duplicate protection are fragile |
| Settings/auth change | `../contracts/backend-api.md`, `../runbooks/common-issues.md` | `backend/app/api/settings.py`, `frontend/src/pages/SettingsPage.tsx`, auth infra/tests | Browser storage, DB state, and callback flow all matter |
| Content or brand task | `../content/brand-context.md` | `data/brand-knowledge/`, `data/posts/`, backend validation rules | Brand guidance is not the same as enforced validation |
| Docs or instruction change | `../README.md`, `../meta/source-audit.md` | `AGENTS.md`, `CLAUDE.md`, `docs/agents/` | Do not reintroduce duplicated static summaries |

## Special Cases

- If a task touches `SettingsPage`, inspect both backend auth endpoints and browser storage behavior.
- If a task touches preview, inspect formatter behavior and the `validation` alias in preview responses.
- If a task touches media, remember the editor only allows media actions after the first save.
- If a task touches publish or schedules, inspect both SQLite-backed repository behavior and frontend invalidation logic.
