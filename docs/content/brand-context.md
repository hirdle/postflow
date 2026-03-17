# Brand And Content Context

- Purpose: explain how PostFlow should use the BioVolt brand knowledge without confusing it with runtime configuration
- Status: implemented
- Primary sources: `data/brand-knowledge/README.md`, `data/brand-knowledge/*`, `backend/app/config.py`, `data/posts/*`
- Related paths: `product/overview.md`, `workflows/operations.md`, `agents/task-routing.md`
- Update triggers: changes to brand knowledge structure, content process, or validation policy ownership
- Last reviewed: 2026-03-17

## Canonical Brand Sources

The authoritative brand and content material lives under `data/brand-knowledge/`.

Important subtrees:

- `company/about.md`
- `tone-of-voice/tov.md`
- `audience/target-audience.md`
- `products/products.md`
- `content-types/content-strategy.md`
- `guidelines/blog-guidelines.md`
- `templates/telegram.md`
- `templates/vk.md`

## How PostFlow Uses This Context

- Humans and agents should consult the brand docs for positioning, tone, audience, and template guidance
- Runtime validation does not parse these files directly
- Platform policy, length limits, hashtag ranges, and emoji restrictions are implemented in `backend/app/config.py`

## Operational Rule

For content-related tasks:

1. Read `data/brand-knowledge/README.md`
2. Read the relevant platform template and tone-of-voice files
3. Cross-check with current validation rules in backend config
4. Do not claim the backend enforces a rule unless it is actually encoded in code

## Why This Matters

Without this distinction, agents can easily confuse:

- brand guidance with runtime-enforced rules
- product intent with implemented constraints
- template examples with canonical file format

This page exists to keep those layers separate.
