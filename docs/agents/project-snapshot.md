# Project Snapshot

- Purpose: give agents a quick, implementation-accurate snapshot of the current PostFlow surface
- Status: implemented
- Primary sources: `backend/app/api/`, `frontend/src/pages/`, `data/`, `backend/tests/`
- Related paths: `task-routing.md`, `glossary.md`, `contracts/backend-api.md`, `contracts/frontend-surface.md`
- Update triggers: changes to routes, pages, auth flows, storage, or tested hotspots
- Last reviewed: 2026-03-17

## Implemented UI Surface

- Posts list at `/`
- Post editor at `/posts/new` and `/posts/:filename`
- Schedules queue at `/schedules`
- Settings page with Telegram, VK, and image API controls at `/settings`
- VK callback finalizer at `/settings/vk/callback`

## Implemented Backend Surface

- Posts API
- Preview API
- Media API, including model listing
- Publish and schedules APIs
- Settings API
- Telegram QR auth session flow
- VK auth session flow plus manual token connect

## Storage Surface

- Markdown drafts in `data/posts/`
- Bound images in `data/images/`
- SQLite state in `data/publish.db`
- Brand context in `data/brand-knowledge/`

## Auth Surface

- Telegram publishing uses a session file and in-app QR auth flow
- VK can be connected through session-based auth or manual token paste
- VK connection includes community discovery and selection

## Current Testing Surface

Backend tests explicitly cover:

- Telegram QR auth manager behavior
- VK auth manager behavior
- manual VK token parsing and persistence helpers
- VK client token refresh, permissions, and community access

## High-Level Risks

- Settings/auth flows are the most stateful and easiest area to regress
- Publish status derives from SQLite records, not only markdown content
- Preview JSON uses a serialization alias (`validation`) that the frontend depends on
- Media flows require a saved filename before assets can be attached

## Documentation Implication

This page should stay short. Detailed behavior belongs in the main docs, but agents should always be able to get a correct mental model from this page first.
