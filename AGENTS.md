# PostFlow Agent Instructions

## Canonical Reading Order

Before doing substantial work in this repo, read in this order:

1. [README.md](README.md)
2. [docs/README.md](docs/README.md)
3. [docs/agents/README.md](docs/agents/README.md)
4. [docs/agents/project-snapshot.md](docs/agents/project-snapshot.md)
5. [docs/agents/invariants.md](docs/agents/invariants.md)
6. Task-specific docs from [docs/agents/task-routing.md](docs/agents/task-routing.md)

Do not rebuild project context only from `PRD.md` and scattered code unless the docs are missing or stale.

## Source Hierarchy

1. Runtime truth: `backend/`, `frontend/`, `data/`
2. Product intent: `PRD.md`
3. Curated working docs: `docs/`
4. Repo-local agent routing and memory bank: `docs/agents/`

If code and docs disagree, code is the implementation truth. Fix the mismatch in the docs as part of the same task when appropriate.

## GitHub Workflow

Use the shared `github-projects` skill, but follow the repo-specific rules from [docs/agents/skills.md](docs/agents/skills.md).

- Repo: `hirdle/postflow`
- Project: Project #5 "Post Flow Project"
- Owner: `--owner @me`
- Pipeline: `Backlog -> Todo -> In Progress -> In Review -> Done`

When starting work on a task:

1. Read the GitHub issue for context.
2. Move the issue/project item to `In Progress`.
3. Log progress with issue comments.
4. On completion, commit the work.
5. Only after the commit, move the issue to `In Review` or `Done`.

All work is done directly on `main`. No feature branches or PRs.

## Frontend Testing Rule

For every frontend task that changes user-facing UI:

1. Add an issue comment describing planned Playwright coverage before or during implementation.
2. When the UI is testable, run browser-based Playwright checks against the Docker stack.
3. Log the result or blocker in the issue before moving the task to `Done`.

## Task Routing

- Backend/API: `docs/contracts/backend-api.md`
- Frontend/UI: `docs/contracts/frontend-surface.md`
- Publish/schedules: `docs/workflows/operations.md`, `docs/runbooks/common-issues.md`
- Settings/auth: `docs/contracts/backend-api.md`, `docs/runbooks/common-issues.md`
- Content/brand: `docs/content/brand-context.md`, then `data/brand-knowledge/`
- Agent workflow or instruction edits: `docs/agents/`

## Project Guardrails

- No runtime imports from `mcps/`
- No `mcp` or `FastMCP` runtime dependencies
- No secret exposure to the frontend
- No post deletion flow
- No batch publish flow
- No autosave
- No brand-context API endpoint
- Platform policy lives in `backend/app/config.py`, not in docs

## Documentation Rule

- Prefer linking to canonical docs over duplicating project summaries in instruction files.
- If behavior changes, update the relevant page in `docs/` and, if agent routing changed, the relevant page in `docs/agents/`.
