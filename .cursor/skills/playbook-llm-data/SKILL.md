---
name: playbook-llm-data
description: >-
  Enforces LLM-retrieval-first play data, RAG-ready surfaces, and safe edits.
  Use when changing plays, play_versions, Supabase schema, embeddings, or
  assistant / Q&A features.
---

# Playbook LLM data workflow

1. **Before** changing persistence, embeddings, or `PlayDocument` shape, read the full contract in `.cursor/rules/llm-first-data.mdc`.
2. **Touch points**: domain types `src/domain/play/types.ts`, validation `src/domain/play/schema.ts`, mutations `src/domain/play/commands.ts`, persistence `src/app/actions/plays.ts` (and related actions), schema `supabase/migrations/*.sql`.
3. **On every version save**: keep `public.plays` mirror columns aligned with `PlayDocument.metadata` (and any other denormalized fields the app reads).
4. **When adding coach-visible concepts**: extend Zod + TS types first, then wire save/load and any **derived narrative** or chunk rows in the same change set so RAG never lags the canonical model.
