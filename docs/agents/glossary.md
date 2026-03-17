# Glossary And Hotspots

- Purpose: give agents a compact vocabulary guide plus the most failure-prone areas of the project
- Status: implemented
- Primary sources: backend models, publishing/status logic, frontend routes, auth flows
- Related paths: `project-snapshot.md`, `invariants.md`, `../contracts/backend-api.md`
- Update triggers: new domain terms, new state machines, or new recurring failure areas
- Last reviewed: 2026-03-17

## Glossary

- Draft: markdown-backed post file in `data/posts/`
- Publish record: row in `publish_records` describing scheduled/published/cancelled/failed state
- Publish attempt: row in `publish_attempts` logging publish/cancel/reschedule actions
- Platform policy: hard-coded validation and default-account rules in `backend/app/config.py`
- Telegram session: backend-managed QR auth flow used to create a reusable Telethon session file
- VK auth session: backend-managed short-lived auth flow that ends with token persistence and community discovery
- Manual VK token connect: fallback flow where the user pastes either `blank.html` URL or raw token
- Community selection: choosing the publish target group after VK auth succeeds
- Normalized post: backend preview payload re-parsed into canonical post structure

## Known Hotspots

### Settings/auth surface

- `frontend/src/pages/SettingsPage.tsx` coordinates browser storage, polling, backend auth state, and user messaging
- small UI changes can break session recovery or callback completion

### Preview contract alias

- frontend expects preview issues under JSON key `validation`
- backend field name is `validation_issues` with a serialization alias

### Media requires saved filename

- upload/generate/delete media only work after the draft exists
- changing this assumption affects both backend naming and editor UX

### Publish uniqueness and status

- active scheduled/published uniqueness is enforced in logic and SQLite index
- status badges in the UI depend on DB records, not just post file state

### Brand guidance vs runtime validation

- brand docs are important for content decisions
- backend validation rules still come from code, not from `data/brand-knowledge/`
