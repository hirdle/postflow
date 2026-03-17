# Decisions And Invariants

- Purpose: record stable rules agents must preserve when changing PostFlow
- Status: implemented
- Primary sources: `AGENTS.md`, `CLAUDE.md`, `PRD.md`, backend config, current UI/backend behavior
- Related paths: `task-routing.md`, `glossary.md`, `../product/overview.md`
- Update triggers: policy changes, workflow changes, or explicit product decisions
- Last reviewed: 2026-03-17

## Source Hierarchy

1. Code and runtime state define implementation truth
2. `PRD.md` defines product intent and boundaries
3. `docs/` is the curated working layer
4. `docs/agents/` is the fast-start layer for agents

## Product Invariants

- No post deletion flow
- No batch publish
- No autosave
- Manual save remains the main editing contract
- Preview must support Telegram and VK views
- Unsaved changes warning must remain in place
- Secrets must never be exposed to the frontend

## Implementation Invariants

- No runtime imports from `mcps/`
- Do not add `mcp` or `FastMCP` as runtime dependencies
- Platform policy is implemented in `backend/app/config.py`, not parsed from docs
- Validation levels mean:
  - `error` blocks publish
  - `warning` informs but does not block
  - `info` is informational
- Publish status is derived from SQLite publish records

## Workflow Invariants

- Work goes through GitHub issues in `hirdle/postflow`
- Project board is Project #5 "Post Flow Project"
- Status flow is `Backlog -> Todo -> In Progress -> In Review -> Done`
- Work happens directly on `main`
- After each completed issue, create a dedicated commit before moving the issue to `Done`
- Frontend tasks that change user-facing UI must log planned Playwright coverage and then log test result or blocker before closing

## Freshness Rules

- If docs and code diverge, fix the docs in the same task when feasible
- Do not copy static repo summaries into multiple instruction files
- Prefer linking to canonical docs over duplicating content
