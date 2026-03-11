# PostFlow — BioVolt Post Publisher

## Project Overview

Internal post operations tool for BioVolt. Manages creation, editing, preview and publishing of posts to Telegram and VK.

- **PRD:** `PRD.md` (v3.0, approved)
- **Repo:** `hirdle/postflow`
- **GitHub Project:** `hirdle/postflow` → Project #5 "Post Flow Project"
- **Single user:** BioVolt content manager
- **Deployment:** Local Docker (docker-compose)

## GitHub Workflow

### Issues

All work items MUST be created as GitHub issues in `hirdle/postflow` and linked to **Project #5**.

When creating issues:

```bash
gh issue create --repo hirdle/postflow --title "Title" --body "Description" --project "Post Flow Project"
```

Issue labels to use: `backend`, `frontend`, `bug`, `enhancement`, `infra`.

### Branches

All work is done directly on `main`. No feature branches or PRs — commit straight to main.

### Project Board Statuses

- **Todo** — created, not started
- **In Progress** — actively being worked on
- **Done** — merged/completed

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Python 3.11+ / FastAPI |
| Telegram | Telethon |
| VK | httpx |
| Image API | OpenAI Python SDK |
| Markdown | python-frontmatter |
| DB | SQLite |
| Frontend | React + TypeScript + Vite |
| Data fetching | TanStack Query |
| Styling | Tailwind CSS |
| Deploy | Docker + docker-compose |

## Project Structure

```
postflow/
├── backend/           # FastAPI app
│   ├── app/
│   │   ├── api/       # Route handlers
│   │   ├── core/      # Business logic (posts, preview, publishing, media)
│   │   ├── infra/     # External clients (telegram, vk, image API, db)
│   │   └── schemas/   # Pydantic schemas
│   └── Dockerfile
├── frontend/          # React app
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   └── types/
│   └── Dockerfile
├── data/
│   ├── posts/         # Markdown post files (source of truth)
│   ├── images/        # Generated/uploaded images
│   ├── brand-knowledge/  # Brand guidelines (Obsidian vault, read-only)
│   └── publish.db     # SQLite (statuses, attempts, settings)
├── docker-compose.yml
├── CLAUDE.md
└── PRD.md
```

## Key Conventions

### Posts

- Format: YAML frontmatter + markdown body + optional poll + optional image prompt
- File naming: `YYYY-MM-DD-platform-NN.md`
- Location: `data/posts/`
- Images: `data/images/<post-stem>.png`

### Backend

- No MCP imports. All logic is standalone.
- Parser must be tolerant of imperfect markdown formatting.
- Policy table (post length, hashtags, emoji rules) is in backend config, not parsed from docs.
- Validation: `error` blocks publish, `warning` shows but doesn't block, `info` is informational.
- Tokens/secrets stored in SQLite `app_settings`, never exposed to frontend.

### Frontend

- Manual save (button), no autosave.
- Preview switches between Telegram and VK views.
- Unsaved changes indicator + close warning.

### API Patterns

```
GET/POST/PUT  /api/posts          # No DELETE
POST          /api/preview        # Draft payload, returns rendered + validation
POST/GET/DEL  /api/media          # Upload, generate, delete images
POST          /api/publish        # Publish or schedule
GET/DEL/PATCH /api/schedules      # View, cancel, reschedule
GET/PUT       /api/settings       # Masked tokens on GET
```

## What NOT to Do

- Do not import from `mcps/publish-mcp/` or `mcps/image-gen-mcp/` in runtime code.
- Do not add `mcp` or `FastMCP` as dependencies.
- Do not expose tokens/secrets to the frontend.
- Do not add post deletion to the UI.
- Do not add batch publish functionality.
- Do not add autosave.
- Do not build a brand context API endpoint.
