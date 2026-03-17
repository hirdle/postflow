# Common Issues And Runbooks

- Purpose: provide operational diagnostics for the current PostFlow stack and integrations
- Status: implemented
- Primary sources: backend routes, publishing service, auth flows, backend tests, frontend settings/editor pages
- Related paths: `workflows/operations.md`, `contracts/backend-api.md`, `agents/glossary.md`
- Update triggers: changes to publish behavior, auth handling, storage, or error surfaces
- Last reviewed: 2026-03-17

## Backend Does Not Start Or Healthcheck Fails

Symptoms:

- frontend does not become available
- Docker shows backend unhealthy
- `GET /api/health` fails

Checks:

- confirm `docker compose up --build` completed
- open `http://localhost:8000/api/health`
- confirm `data/` is mounted and writable

Likely causes:

- backend dependency or import failure
- SQLite init failure
- broken route import

## Publish Is Blocked By Validation Errors

Symptoms:

- publish dialog shows blocking issues
- `POST /api/publish/{filename}` returns `400`

Checks:

- inspect preview validation output in the editor
- verify date, time, platform, title, and body are present
- verify poll has 2-10 options if enabled

Notes:

- only `error` level blocks publish
- `warning` and `info` still matter for content quality

## Telegram QR Flow Expires Or Requires Password

Symptoms:

- QR session moves to `expired`
- session moves to `password_required`
- publishing cannot use Telegram yet

Checks:

- restart Telegram QR flow in `/settings`
- confirm `telegram_api_id` and `telegram_api_hash` are saved
- submit 2FA password if required
- check whether a session file is expected at the configured `telegram_session_path`

## VK Auth Or Token Flow Fails

Symptoms:

- VK auth callback errors
- manual token connect returns permission issues
- no communities are available

Checks:

- confirm `vk_client_id` is saved
- verify token scopes include `wall`, `photos`, `groups`, and `offline`
- confirm the selected community has posting rights
- if using the manual fallback, paste the full `blank.html` URL or raw token exactly once

Implementation note:

- backend tests explicitly cover permission bitmask handling, token refresh, and community role merging

## Media Model List Or Generation Fails

Symptoms:

- `/api/media/models` fails
- image generation errors from the editor

Checks:

- confirm `image_api_key`, `image_base_url`, and optional default model in settings
- remember model listing and generation can fail independently
- confirm the draft is already saved before upload/generate

## Scheduled Publish Cannot Be Cancelled Or Rescheduled

Symptoms:

- schedule actions return `400`, `404`, or `502`

Checks:

- confirm the record still exists in `/api/schedules`
- inspect publish record history in the editor
- remember only records in `scheduled` state are valid for cancel/reschedule

## Where To Inspect State

- Markdown drafts: `data/posts/`
- Images: `data/images/`
- SQLite DB: `data/publish.db`
- Publish status and attempt history: editor status panel plus DB tables
- Telegram auth artifacts: configured session file path in settings

Optional SQLite inspection:

```bash
sqlite3 data/publish.db '.tables'
sqlite3 data/publish.db 'select * from publish_records order by id desc limit 20;'
sqlite3 data/publish.db 'select * from publish_attempts order by id desc limit 20;'
```
