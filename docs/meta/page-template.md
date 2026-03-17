# Documentation Page Template

- Purpose: template for new documentation pages in `docs/`
- Status: implemented
- Primary sources: this file is normative for docs page structure
- Related paths: `docs/README.md`, `docs/meta/source-audit.md`
- Update triggers: whenever the project adds a new docs page type or the team changes documentation conventions
- Last reviewed: 2026-03-17

## Required Header

Every stable documentation page should start with:

- Purpose
- Status: `implemented`, `planned`, or `legacy`
- Primary sources
- Related paths
- Update triggers
- Last reviewed

## Recommended Body Structure

1. Short statement of what the page explains
2. Current implemented behavior
3. Important caveats or mismatches vs `PRD.md`
4. Paths, endpoints, files, or commands a reader should inspect next
5. Maintenance notes if the page is likely to drift

## Rules

- Do not present PRD-only features as implemented.
- Prefer concrete paths, routes, field names, and state names over vague summaries.
- Link to source directories instead of copying large chunks of code.
- For agent-facing pages, optimize for quick routing and invariants.
- For human-facing pages, optimize for operational clarity and low ambiguity.
