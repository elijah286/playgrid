<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## LLM-first data (required)

All play and playbook persistence MUST stay **retrieval- and edit-friendly** for an integrated LLM: canonical typed `PlayDocument` in `play_versions.document`, denormalized truth on `public.plays`, preserved route/formation semantics, deterministic text for future RAG, and command-shaped mutations. Full checklist: `.cursor/rules/llm-first-data.mdc`. Workflow skill: `.cursor/skills/playbook-llm-data/SKILL.md`.

## Git workflow

Work directly on `main`. Commit and push small, focused changes straight to `main` instead of creating long-lived feature branches. Only create a branch when the user explicitly asks for one (e.g. a WIP spike, an experimental refactor the user wants isolated). Do not open pull requests unless asked.

## Feature catalog (required)

Whenever you ship a new user-facing feature or capability, add an entry to `src/lib/site/features-catalog.ts` **in the same commit**. This catalog is the source of truth for the Site Admin → Feature list tab and is used for marketing copy, sales conversations, and changelog reference. Bug fixes and internal refactors do NOT need entries — only things a coach, admin, or marketing person could meaningfully describe in a sentence.
