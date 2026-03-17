# Repo-Specific Skill Guidance

- Purpose: explain how shared skills should be applied inside PostFlow without modifying the shared skills themselves
- Status: implemented
- Primary sources: repo workflow rules, available shared skills, `AGENTS.md`, `CLAUDE.md`
- Related paths: `README.md`, `invariants.md`, `task-routing.md`
- Update triggers: changes to shared skill usage, project workflow, or repo-local documentation entrypoints
- Last reviewed: 2026-03-17

## General Rule

Shared skills stay generic. PostFlow-specific behavior lives in this repo and in the repo-local instruction files.

Before using any shared skill:

1. Read `README.md`
2. Read `docs/README.md`
3. Read `docs/agents/README.md`
4. Read the task-specific docs from `task-routing.md`

## `github-projects`

Use `github-projects` for issue and board work, but override the shared skill defaults with the PostFlow repo rules:

- repo: `hirdle/postflow`
- project: Project #5 "Post Flow Project"
- owner flag: `--owner @me`
- issue-first workflow
- statuses: `Backlog -> Todo -> In Progress -> In Review -> Done`

Repo rule:

- if there is no issue for the work, create one and link it to Project #5 before starting

## `openai-docs`

Use only when the task explicitly needs current official OpenAI documentation, for example:

- choosing a current OpenAI SDK/API behavior
- comparing latest official model guidance

Do not use it for ordinary PostFlow runtime behavior. Local code and local docs are the primary sources for this repo.

## Other Shared Skills

- `blog-cover`: only relevant if PostFlow work explicitly requires BioVolt article cover generation assets
- `skill-creator` and `skill-installer`: not part of normal PostFlow feature work

## If A Shared Skill Conflicts With Repo Docs

- prefer repo-local docs and invariants
- treat the shared skill as a helper, not the canonical project contract
