# Agent Memory Bank

- Purpose: repo-local memory bank and routing layer for AI agents working in PostFlow
- Status: implemented
- Primary sources: `docs/README.md`, `backend/`, `frontend/`, `AGENTS.md`, `CLAUDE.md`
- Related paths: `project-snapshot.md`, `task-routing.md`, `invariants.md`, `glossary.md`, `skills.md`
- Update triggers: any change to repo workflow, task routing, critical hotspots, or implemented surface
- Last reviewed: 2026-03-17

## Why This Exists

Agents previously had to reconstruct context from code, `PRD.md`, and duplicated instruction files. This memory bank provides the fast-start layer for repo-local context.

## Mandatory Reading Order

1. [README.md](../../README.md)
2. [docs/README.md](../README.md)
3. This page
4. [project-snapshot.md](project-snapshot.md)
5. [invariants.md](invariants.md)
6. Task-specific page from [task-routing.md](task-routing.md)

## Pages In This Section

- [project-snapshot.md](project-snapshot.md): what is actually implemented today
- [task-routing.md](task-routing.md): where to read first for each task type
- [invariants.md](invariants.md): rules the agent must not violate
- [glossary.md](glossary.md): project vocabulary and known hotspots
- [skills.md](skills.md): repo-specific usage rules for shared skills

## Freshness Rule

If code and docs disagree:

- trust code as implementation truth
- record the mismatch clearly
- fix the relevant docs within the same task when appropriate
