# Product Overview

- Purpose: explain what PostFlow is, who it serves, and which boundaries matter during implementation
- Status: implemented
- Primary sources: `PRD.md`, `backend/app/config.py`, current frontend pages
- Related paths: `system/architecture.md`, `content/brand-context.md`, `agents/invariants.md`
- Update triggers: changes to user scope, supported platforms, product goals, or explicit non-goals
- Last reviewed: 2026-03-17

## What PostFlow Is

PostFlow is an internal BioVolt publishing workstation for one content manager. It supports drafting, previewing, scheduling, and publishing content to Telegram and VK from a local Docker stack.

## Current Implemented Product Surface

- Post list with filters by platform, status, rubric, date range, and text search
- Post editor with metadata, content, hashtags, optional poll, optional image prompt, live preview, and publication dialog
- Scheduling queue with cancel and reschedule actions
- Settings page for Telegram auth, VK auth/manual token handling, community selection, and image API settings
- Local-only storage of post files, generated/uploaded images, app settings, and publish records

## Intended User

- Single internal BioVolt content manager
- No multi-user access control
- No external audience-facing admin panel

## Product Boundaries

### In scope today

- Telegram and VK only
- Manual save, not autosave
- Single-post workflows, not batch operations
- Local Docker runtime with SQLite persistence

### Explicit non-goals

- Post deletion in UI or API
- Batch publishing
- Autosave
- Runtime imports from MCP packages
- Exposing tokens or secrets to the frontend
- Building a brand-context API endpoint

## Platform Constraints

Platform rules are implemented in `backend/app/config.py`, not read from brand docs:

- Telegram default username: `@biovoltru`
- VK default username: `@biovolt`
- Telegram length range: 500-1500 chars
- VK length range: 500-2000 chars
- Emoji are currently flagged by validation
- Hashtag ranges differ by platform

## Terminology

- Draft: a markdown-backed post that has not been published yet
- Scheduled: a reserved publish record with future date/time and remote platform message reference
- Published: a completed publish record
- Publish attempt: a log entry for publish/cancel/reschedule activity
- Session file: Telethon session used for Telegram publishing
