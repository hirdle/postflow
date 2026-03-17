# Backend API Contracts

- Purpose: document the implemented backend HTTP surface and important payload behaviors
- Status: implemented
- Primary sources: `backend/app/api/`, `backend/app/schemas/`, `backend/app/core/`, `backend/tests/`
- Related paths: `contracts/frontend-surface.md`, `workflows/operations.md`, `runbooks/common-issues.md`
- Update triggers: any route, schema, validation, auth, or publish behavior change
- Last reviewed: 2026-03-17

## Core Principles

- All API routes are prefixed with `/api`
- There is no post deletion endpoint
- Secrets are masked on `GET /api/settings`
- Preview validation serializes as `validation` in JSON even though the backend field name is `validation_issues`

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Container and backend liveness check |

## Posts

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/posts` | List posts with filters: `platform`, `date_from`, `date_to`, `status`, `rubric`, `search` |
| `GET` | `/api/posts/{filename}` | Load one post plus raw markdown, publish records, and publish attempts |
| `POST` | `/api/posts` | Create a new markdown-backed draft and auto-generate `YYYY-MM-DD-platform-NN.md` filename |
| `PUT` | `/api/posts/{filename}` | Update an existing draft |

Important behavior:

- `filename` must be a plain `.md` filename, not a path
- `post_type` accepts both `type` and `post_type` aliases
- hashtags are normalized and deduplicated
- poll options must be between 2 and 10
- image attachment is derived from `data/images/<stem>.(png|jpg|jpeg|webp)`

## Preview

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/preview` | Normalize a draft payload, render platform-specific preview text, and return validation output |

Important behavior:

- Telegram preview renders a limited HTML-like format
- VK preview strips markdown emphasis to plain text
- Response includes `rendered_text`, `poll`, `validation`, `char_count`, `platform`, and `normalized_post`
- Preview is used both for user-facing preview and for publish-validation checks

## Media

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/media/models` | Fetch available upstream image models |
| `POST` | `/api/media/upload/{filename}` | Upload and bind an image to a saved draft |
| `POST` | `/api/media/generate` | Generate an image using `file_name`, `prompt`, optional `model`, and `size` |
| `GET` | `/api/media/{filename}` | Return image file content |
| `DELETE` | `/api/media/{filename}` | Delete the bound image |

Important behavior:

- Media actions require a stable saved filename from the post editor
- Generated/uploaded assets are returned with relative `image_path`
- Model listing and generation can fail independently depending on upstream image API settings

## Publish And Schedules

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/publish/{filename}` | Publish immediately or schedule when payload contains `schedule: true` |
| `GET` | `/api/schedules` | List currently scheduled posts |
| `DELETE` | `/api/schedules/{record_id}` | Cancel a scheduled post |
| `PATCH` | `/api/schedules/{record_id}` | Reschedule a scheduled post |

Important behavior:

- Publish is blocked only by validation issues with level `error`
- Duplicate active publish records are prevented by both logic and a SQLite partial unique index
- Publish attempts are logged to `publish_attempts`
- Scheduled/published uniqueness is per `file_name + platform`

## Settings

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/settings` | Load masked settings and VK auth status |
| `PUT` | `/api/settings` | Update plain settings values |
| `POST` | `/api/settings/telegram/session` | Start Telegram QR auth session |
| `GET` | `/api/settings/telegram/session/{session_id}` | Poll Telegram auth session state |
| `POST` | `/api/settings/telegram/session/{session_id}/password` | Submit Telegram 2FA password |
| `DELETE` | `/api/settings/telegram/session/{session_id}` | Cancel Telegram auth flow |
| `POST` | `/api/settings/vk/session` | Start VK auth session and receive authorize URL |
| `GET` | `/api/settings/vk/session/{session_id}` | Poll VK auth session state |
| `POST` | `/api/settings/vk/session/{session_id}/exchange` | Exchange callback payload/code/token into a persisted VK connection |
| `DELETE` | `/api/settings/vk/session/{session_id}` | Cancel VK auth session |
| `GET` | `/api/settings/vk/communities` | List publish-capable communities for the current VK auth state |
| `POST` | `/api/settings/vk/token` | Manual fallback: connect via blank.html URL or raw access token |
| `DELETE` | `/api/settings/vk/connection` | Disconnect VK and clear persisted auth data |

Important behavior:

- `GET /api/settings` masks secret values like API keys and tokens
- VK auth status is derived as `not_connected`, `connected`, or `expired`
- Manual VK token connect validates permissions and communities before persistence
- Telegram and VK flows are both stateful session-based flows managed by the backend

## Persistent Data

SQLite tables:

- `publish_records`
- `publish_attempts`
- `app_settings`

Operational note:

- Settings auth flows rely on DB-backed state plus browser storage on the frontend
- Publish status shown in the editor and list pages comes from `publish_records`, not just markdown metadata
