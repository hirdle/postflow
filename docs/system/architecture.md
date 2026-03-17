# System Architecture

- Purpose: describe the runtime topology, code layout, and storage model of the current PostFlow implementation
- Status: implemented
- Primary sources: `docker-compose.yml`, `backend/app/main.py`, `backend/app/config.py`, `frontend/src/App.tsx`, `data/`
- Related paths: `contracts/backend-api.md`, `contracts/frontend-surface.md`, `workflows/operations.md`
- Update triggers: changes to services, storage, ports, route layout, or external integrations
- Last reviewed: 2026-03-17

## Runtime Topology

PostFlow runs as two local services:

- `backend`: FastAPI app on port `8000` inside the container, exposed via `${POSTFLOW_BACKEND_PORT:-8000}`
- `frontend`: Vite dev server on port `3000` inside the container, exposed via `${POSTFLOW_FRONTEND_PORT:-3000}`

The frontend talks to the backend via `/api` requests. The backend owns all filesystem and SQLite writes.

## Service Responsibilities

### Frontend

- React 18 + React Router + TanStack Query
- Renders pages for posts, schedules, settings, and VK callback finalization
- Holds transient editor/UI state such as unsaved-change tracking, preview panel state, and auth session IDs in browser storage

### Backend

- FastAPI app with `/api` prefix and `/api/health`
- Parses markdown post files
- Validates drafts and renders preview payloads
- Publishes to Telegram and VK
- Stores publish records, publish attempts, and masked settings in SQLite
- Manages Telegram QR auth sessions and VK auth sessions
- Proxies image generation/list-models behavior through the configured image API client

## Repository Map

- `backend/app/api/`: HTTP endpoints
- `backend/app/core/posts/`: post models, parser, serializer, validation
- `backend/app/core/preview/`: Telegram/VK preview formatters
- `backend/app/core/publishing/`: publish service and status repository
- `backend/app/core/media/`: image generation/storage helpers
- `backend/app/infra/`: database and external client integrations
- `frontend/src/pages/`: route-level UI
- `frontend/src/components/`: shared UI and publish/status helpers
- `data/posts/`: markdown source of truth for drafts
- `data/images/`: generated/uploaded assets
- `data/publish.db`: SQLite database
- `data/brand-knowledge/`: read-only brand context for content tasks

## Storage Model

| Path | Meaning |
| --- | --- |
| `data/posts/*.md` | Draft and scheduled content source files |
| `data/images/` | Post images keyed by post stem |
| `data/publish.db` | `publish_records`, `publish_attempts`, `app_settings` |
| `data/*.session` | Telegram session artifacts |

## Data Flow

1. User edits a post in the frontend editor.
2. Frontend sends `POST /api/preview` to validate and render preview output.
3. Frontend saves drafts through `POST /api/posts` or `PUT /api/posts/{filename}`.
4. Backend writes markdown to `data/posts/`.
5. Media routes write image files into `data/images/`.
6. Publish routes create and update records in SQLite and call Telegram/VK clients.
7. Schedule and settings screens reload state from backend APIs and database-backed settings.

## Health And Boot

- Backend boot ensures runtime directories and initializes SQLite tables.
- Docker healthcheck uses `GET /api/health`.
- Frontend depends on backend health before starting.
