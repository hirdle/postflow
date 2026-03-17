# Workflows And Local Operations

- Purpose: document the main operating flows in the current implementation
- Status: implemented
- Primary sources: frontend pages, backend routes, `docker-compose.yml`, sample posts in `data/posts/`
- Related paths: `contracts/backend-api.md`, `runbooks/common-issues.md`, `content/brand-context.md`
- Update triggers: changes to editor UX, auth flows, publish behavior, or local dev setup
- Last reviewed: 2026-03-17

## Local Development

Start the stack:

```bash
docker compose up --build
```

Useful endpoints:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/api/health`

Mounted runtime data:

- `./backend:/app`
- `./data:/data`
- `./frontend:/app`

## Draft Lifecycle

1. Open `/posts/new`
2. Fill date, time, platform, username, content metadata, body, hashtags, optional poll, optional image prompt
3. Save the draft to create the markdown file in `data/posts/`
4. Continue editing the saved draft by filename route
5. Use live preview to validate Telegram or VK output

Important constraint:

- Media and publish actions require a saved draft because the backend uses the filename as the stable asset key

## Preview And Validation

1. Editor sends debounced `POST /api/preview`
2. Backend normalizes the payload and re-parses markdown-equivalent content
3. UI shows rendered preview, poll preview, char count, and validation issues
4. Publish dialog reuses preview validation data to block bad publishes

Validation semantics:

- `error`: blocks publish
- `warning`: visible but non-blocking
- `info`: informational only

## Image Workflow

1. Save the draft first
2. Expand the image prompt block
3. Either upload a local image or generate one from the prompt
4. Optional: choose an upstream model from `/api/media/models`
5. Confirm preview thumbnail in the editor

Storage behavior:

- Images are stored under `data/images/`
- The asset name is based on the post filename stem

## Publish Workflow

1. Save the draft
2. Open the publish dialog
3. Review validation output
4. Publish now or schedule using the draft date/time
5. Inspect resulting record in the editor status panel or schedules page

Operational behavior:

- Duplicate scheduled/published records are rejected
- Publish attempts are recorded for later debugging

## Schedule Workflow

1. Open `/schedules`
2. Review queued items
3. Cancel or reschedule an item
4. Let React Query invalidate post and schedule caches

## Telegram Auth Workflow

1. Open `/settings`
2. Save Telegram API ID and API Hash if needed
3. Start QR auth
4. Scan QR code in Telegram
5. If prompted, submit 2FA password
6. Backend stores usable session file for publishing

## VK Auth Workflow

Two supported paths currently exist:

- Session-based auth flow started from `/settings/vk/session`
- Manual fallback by pasting `blank.html` URL or raw access token into the VK token field

After auth:

1. Backend validates VK scopes
2. Backend loads available communities
3. User chooses the target community in settings

## Post File Format

A saved draft is a markdown file with:

- YAML frontmatter for date, time, platform, rubric, type, hook_type
- markdown title/body
- optional footer username and hashtag line
- optional poll block
- optional image prompt section after `---`
