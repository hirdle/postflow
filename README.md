# PostFlow

PostFlow is an internal BioVolt operations tool for creating, previewing, scheduling, and publishing posts to Telegram and VK.

This repository now uses `docs/` as the canonical documentation hub for both humans and AI agents.

## Start Here

1. Read [docs/README.md](docs/README.md) for the full documentation index.
2. Read [docs/agents/README.md](docs/agents/README.md) if you are acting as an agent or preparing a task for one.
3. Treat [PRD.md](PRD.md) as product intent and roadmap context, not as the day-to-day operations handbook.

## Quick Start

```bash
docker compose up --build
```

- Backend: `http://localhost:8000/api/health`
- Frontend: `http://localhost:3000`
- Default ports can be overridden via `POSTFLOW_BACKEND_PORT` and `POSTFLOW_FRONTEND_PORT`

## Source Of Truth Hierarchy

1. Runtime behavior and contracts in `backend/`, `frontend/`, and `data/`
2. Product intent and scope boundaries in `PRD.md`
3. Curated working docs in `docs/`
4. Repo-local agent routing and memory bank in `docs/agents/`

When code and docs disagree, code is the implementation truth and the mismatch should be documented and fixed in the same task.

## Reading Paths

- New engineer: [docs/README.md](docs/README.md) -> [docs/system/architecture.md](docs/system/architecture.md) -> [docs/contracts/backend-api.md](docs/contracts/backend-api.md) -> [docs/workflows/operations.md](docs/workflows/operations.md)
- Frontend task: [docs/README.md](docs/README.md) -> [docs/contracts/frontend-surface.md](docs/contracts/frontend-surface.md) -> [docs/workflows/operations.md](docs/workflows/operations.md) -> [docs/agents/task-routing.md](docs/agents/task-routing.md)
- Backend task: [docs/README.md](docs/README.md) -> [docs/contracts/backend-api.md](docs/contracts/backend-api.md) -> [docs/system/architecture.md](docs/system/architecture.md) -> [docs/agents/task-routing.md](docs/agents/task-routing.md)
- Content task: [docs/README.md](docs/README.md) -> [docs/content/brand-context.md](docs/content/brand-context.md) -> [data/brand-knowledge/README.md](data/brand-knowledge/README.md)
- Agent task: [docs/agents/README.md](docs/agents/README.md) -> [docs/agents/project-snapshot.md](docs/agents/project-snapshot.md) -> [docs/agents/invariants.md](docs/agents/invariants.md) -> task-specific docs
