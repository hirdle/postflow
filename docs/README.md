# PostFlow Documentation Hub

- Purpose: canonical documentation index for the current PostFlow implementation
- Status: implemented
- Primary sources: `PRD.md`, `backend/`, `frontend/`, `docker-compose.yml`, `data/`, `AGENTS.md`, `CLAUDE.md`
- Related paths: `docs/`, `docs/agents/`
- Update triggers: any change to routes, pages, auth flows, storage layout, publish behavior, or agent workflow
- Last reviewed: 2026-03-17

## What This Hub Is

`docs/` is the curated working documentation layer for PostFlow. It is intended to be readable by humans and directly useful to AI agents without forcing them to reconstruct the project only from [PRD.md](../PRD.md) and code.

This hub separates:

- product intent from [PRD.md](../PRD.md)
- implemented behavior from the current codebase
- repo-local operating guidance for agents

## Reading Order

- Start here if you need orientation.
- Then pick one of the focused tracks below.

## Tracks

- Product and scope: [product/overview.md](product/overview.md)
- Runtime architecture and storage: [system/architecture.md](system/architecture.md)
- Backend API and data contracts: [contracts/backend-api.md](contracts/backend-api.md)
- Frontend routes and UX surface: [contracts/frontend-surface.md](contracts/frontend-surface.md)
- Daily workflows and local dev: [workflows/operations.md](workflows/operations.md)
- Failure handling and diagnostics: [runbooks/common-issues.md](runbooks/common-issues.md)
- Brand/content context: [content/brand-context.md](content/brand-context.md)
- Source audit and page template: [meta/source-audit.md](meta/source-audit.md), [meta/page-template.md](meta/page-template.md)
- Agent memory bank: [agents/README.md](agents/README.md)

## Notes On Freshness

- [PRD.md](../PRD.md) remains authoritative for product intent, but not every implemented auth or settings detail is described there.
- `backend/` and `frontend/` are authoritative for the actual API/UI surface.
- `data/brand-knowledge/` is authoritative for brand and content context.
- If you change behavior, update the relevant page in `docs/` and, when needed, the memory bank in `docs/agents/`.
