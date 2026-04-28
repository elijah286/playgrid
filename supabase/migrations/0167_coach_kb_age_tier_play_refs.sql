-- Coach AI KB: add coaching-pedagogy filters used by practice planning + drills.
--
-- age_tier  — pedagogy-bound age tier, distinct from age_division (which is
--             league-bound, e.g. 8U / varsity). Values:
--               tier1_5_8   — first-year / ages 5-8
--               tier2_9_11  — ages 9-11 / 1-2 yrs experience
--               tier3_12_14 — middle school / 2-4 yrs experience
--               tier4_hs    — HS+ / varsity
--             null = universal across tiers
--
-- play_refs — illustrative plays for a chunk (drills, install diagrams, etc.).
--             Postgres arrays don't support FK constraints; integrity is
--             enforced at the application layer when reading/embedding.
--             Render via the existing play diagram + playback components.

alter table public.rag_documents
  add column if not exists age_tier text
    check (age_tier in ('tier1_5_8','tier2_9_11','tier3_12_14','tier4_hs')),
  add column if not exists play_refs uuid[];

comment on column public.rag_documents.age_tier is
  'Pedagogy-bound age tier for coaching/practice content. Distinct from age_division (league-bound).';
comment on column public.rag_documents.play_refs is
  'Illustrative plays for this chunk (drill diagrams, install snapshots). Rendered inline in chat / practice plans.';

-- Replace the filter index to include age_tier so retrieval can prune by tier
-- before vector search.
drop index if exists public.rag_documents_filter_idx;
create index if not exists rag_documents_filter_idx
  on public.rag_documents (scope, scope_id, sport_variant, sanctioning_body, age_tier)
  where retired_at is null;
