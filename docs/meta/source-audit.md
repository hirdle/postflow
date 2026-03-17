# Source Audit And Gap Map

- Purpose: map real sources of truth to documentation targets and record known gaps
- Status: implemented
- Primary sources: `PRD.md`, `backend/`, `frontend/`, `docker-compose.yml`, `data/brand-knowledge/`, `data/posts/`, `backend/tests/`, `AGENTS.md`, `CLAUDE.md`
- Related paths: `docs/README.md`, `docs/meta/page-template.md`
- Update triggers: any major feature addition, workflow change, or documentation restructure
- Last reviewed: 2026-03-17

## Source Matrix

| Source | Authoritative for | Main target docs |
| --- | --- | --- |
| `PRD.md` | Product intent, goals, non-goals, scope framing, architecture intent | `product/overview.md`, `system/architecture.md` |
| `backend/app/api/` + `backend/app/schemas/` | Implemented API surface and request/response contracts | `contracts/backend-api.md` |
| `backend/app/core/` + `backend/app/infra/` | Parsing rules, validation rules, publishing logic, integrations, storage rules | `contracts/backend-api.md`, `workflows/operations.md`, `runbooks/common-issues.md`, `agents/invariants.md` |
| `frontend/src/pages/` + `frontend/src/types/` | Actual UI routes, forms, flows, copy, client-side state | `contracts/frontend-surface.md`, `workflows/operations.md`, `agents/project-snapshot.md` |
| `docker-compose.yml` | Local runtime topology and default ports | `system/architecture.md`, `workflows/operations.md` |
| `data/posts/` samples | Real markdown post format and naming convention | `contracts/backend-api.md`, `workflows/operations.md`, `agents/glossary.md` |
| `data/brand-knowledge/` | Brand and content context | `content/brand-context.md` |
| `backend/tests/` | Verified auth/token/refresh behavior and critical hotspots | `runbooks/common-issues.md`, `agents/project-snapshot.md`, `agents/glossary.md` |
| `AGENTS.md` + `CLAUDE.md` | Repo-level workflow rules for agents | `agents/invariants.md`, `agents/skills.md` |

## Known Gaps And Mismatches

### 1. PRD vs implemented settings/auth surface

- `PRD.md` describes settings at a higher level, but the current implementation includes extra routes and flows for Telegram QR auth and VK auth/session exchange.
- The canonical description for those flows must come from code and tests, not only from the PRD.

### 2. PRD vs implemented media surface

- The implemented backend exposes `GET /api/media/models`, which is an operational extension beyond the minimal media contour in the PRD.
- This route is important for the current editor UX and must be documented as implemented behavior.

### 3. Frontend callback route is implementation-specific

- The frontend has a dedicated `/settings/vk/callback` route to finalize VK auth. This is an implemented UI/runtime detail, not just a product concept.

### 4. Old agent instructions duplicated project overview

- `AGENTS.md` and `CLAUDE.md` previously duplicated a static repo summary.
- That structure was high-risk for drift and is replaced by canonical links into `docs/`.

### 5. Brand knowledge is authoritative but not runtime-configured

- `data/brand-knowledge/` is important for content tasks, but runtime validation still comes from `backend/app/config.py`.
- Documentation must link the brand docs without implying that the backend parses them dynamically.
