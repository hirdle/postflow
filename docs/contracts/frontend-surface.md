# Frontend Surface

- Purpose: document the implemented React routes, page responsibilities, and UX contracts
- Status: implemented
- Primary sources: `frontend/src/App.tsx`, `frontend/src/pages/`, `frontend/src/types/index.ts`
- Related paths: `contracts/backend-api.md`, `workflows/operations.md`, `agents/project-snapshot.md`
- Update triggers: route changes, page-level UX changes, query flows, or storage-key changes
- Last reviewed: 2026-03-17

## Route Map

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | `PostListPage` | Browse and filter posts |
| `/posts/new` | `PostEditorPage` | Create a new draft |
| `/posts/:filename` | `PostEditorPage` | Edit a saved draft, preview, manage media, and publish |
| `/schedules` | `SchedulesPage` | Inspect, cancel, and reschedule queued posts |
| `/settings` | `SettingsPage` | Configure Telegram, VK, and image API settings |
| `/settings/vk/callback` | `VkAuthCallbackPage` | Finalize VK auth callback and exchange result |

## Page Behaviors

### PostListPage

- Uses `GET /api/posts`
- Supports platform, status, rubric, date range, and text search filters
- Debounces search input by 350 ms
- Links into draft creation and existing post editing

### PostEditorPage

- Tracks unsaved changes and arms `beforeunload` warning
- Saves via `POST /api/posts` or `PUT /api/posts/{filename}`
- Uses `POST /api/preview` for preview and publish validation
- Supports platform switching, hashtags, optional poll, and optional image prompt
- Requires a saved draft before upload/generate/delete media actions
- Opens `PublishDialog` for immediate publish or scheduling
- Shows `PublicationStatusPanel` with publish records and attempts

### SchedulesPage

- Uses `GET /api/schedules`
- Allows cancel via `DELETE /api/schedules/{record_id}`
- Allows reschedule via `PATCH /api/schedules/{record_id}`
- Invalidates post and schedule queries after changes

### SettingsPage

- Loads and updates settings via `GET/PUT /api/settings`
- Runs Telegram QR auth start/poll/password/cancel flow
- Supports VK token/manual connect and session-based VK auth
- Loads available VK communities after successful auth
- Stores temporary Telegram session ID in `sessionStorage`
- Uses local browser storage during VK auth callback flow

### VkAuthCallbackPage

- Reads callback params from query string or hash fragment
- Finalizes VK auth via `POST /api/settings/vk/session/{session_id}/exchange`
- Redirects or closes popup after completion

## Shared UX Contracts

- The app is Russian-first in visible UI copy
- Preview panel supports Telegram and VK render modes
- Manual save only; there is no autosave
- Publish modal is viewport-centered
- Navigation resets scroll to top on route change

## Client State Hotspots

- `postflow:telegram-session-id` in `sessionStorage`
- `postflow:vk-session-id` in `localStorage`
- Query invalidation around `posts`, `post`, `schedules`, and `vk-communities`

These keys matter for auth troubleshooting and agent-safe UI changes.
