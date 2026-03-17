# PostFlow Claude Instructions

This file is a thin operational guide. The canonical project context now lives in [README.md](README.md), `docs/`, and `docs/agents/`.

## Read First

1. [README.md](README.md)
2. [docs/README.md](docs/README.md)
3. [docs/agents/README.md](docs/agents/README.md)
4. [docs/agents/project-snapshot.md](docs/agents/project-snapshot.md)
5. [docs/agents/invariants.md](docs/agents/invariants.md)
6. Task-specific docs from [docs/agents/task-routing.md](docs/agents/task-routing.md)

## Use These As Truth

- Implementation truth: `backend/`, `frontend/`, `data/`
- Product intent: `PRD.md`
- Working handbook: `docs/`
- Agent memory bank: `docs/agents/`

If implementation and docs conflict, trust the code and update the docs.

## GitHub And Task Flow

Use the shared `github-projects` skill with the repo-specific rules from [docs/agents/skills.md](docs/agents/skills.md).

- Repo: `hirdle/postflow`
- Project: Project #5 "Post Flow Project"
- Work directly on `main`
- Use issue-first workflow
- Move active tasks to `In Progress`
- Leave progress comments in the issue
- Create a dedicated commit before marking a completed task `Done`

## Frontend Rule

For user-facing UI changes:

- comment planned Playwright coverage in the issue
- run browser-based checks when the UI is testable
- log result or blocker before closing the task

## Main Guardrails

- No runtime `mcps/` imports
- No `mcp` or `FastMCP` runtime dependencies
- No secret exposure in frontend responses
- No post deletion, batch publish, autosave, or brand-context API
- Keep platform policy in `backend/app/config.py`

## Routing Shortcuts

- Backend/API: `docs/contracts/backend-api.md`
- Frontend/UI: `docs/contracts/frontend-surface.md`
- Workflows/runbooks: `docs/workflows/operations.md`, `docs/runbooks/common-issues.md`
- Content tasks: `docs/content/brand-context.md`
- Agent/task routing: `docs/agents/`
