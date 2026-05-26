-- Library concept metadata overrides — Phase B follow-up to 20260526120000.
--
-- Background. The first override migration covered the PLAY content
-- (player positions, route waypoints) + per-play coach notes. The
-- concept-level prose (description, body, when-to-use, common
-- mistakes) still lived in `src/domain/football-kg/defs/concepts.ts`
-- — code-only, no UI for admins to fix typos or update guidance
-- without a deploy.
--
-- This migration extends the same `library_concept_overrides` row
-- with optional metadata columns. When set, they take precedence
-- over the code-level ConceptDef fields anywhere we read them —
-- public library page, Cal's chat-time compose summaries (via the
-- resolver), structured-data emission for SEO. Catalog code stays
-- the fallback; an empty/null column means "use the code default."
--
-- Schema choice. One row per (slug, variant), same as the play
-- content override. Different variants of the same concept can
-- have different common mistakes / when-to-use guidance (5v5
-- Mesh's coaching cues aren't identical to tackle Mesh's), so
-- variant-keying lets admins tune per-variant without
-- duplicating the geometry override.
--
-- `common_mistakes_override jsonb` is a JSON array of strings —
-- matches the shape on `ConceptDef.commonMistakes` so the read
-- path doesn't need to reshape.

alter table public.library_concept_overrides
  -- One-line tactical summary (the chip on the variant page header
  -- and the meta description in SEO). Maps to ConceptDef.description.
  add column if not exists description_override text,
  -- Longer prose (the lead paragraph above the diagram). Maps to
  -- ConceptDef.body, which falls back to description when null in
  -- code; same fallback chain applies here.
  add column if not exists body_override text,
  -- "When to call it" coaching guidance. Maps to ConceptDef.whenToUse.
  add column if not exists when_to_use_override text,
  -- JSON array of strings. Maps to ConceptDef.commonMistakes (also
  -- string[]). Stored as jsonb so we can index/query later if needed.
  add column if not exists common_mistakes_override jsonb;

comment on column public.library_concept_overrides.description_override is
  'When set, replaces ConceptDef.description on library pages and Cal chat-time citations.';
comment on column public.library_concept_overrides.body_override is
  'When set, replaces ConceptDef.body (the longer prose under the diagram).';
comment on column public.library_concept_overrides.when_to_use_override is
  'When set, replaces ConceptDef.whenToUse coaching guidance.';
comment on column public.library_concept_overrides.common_mistakes_override is
  'JSON array of strings (same shape as ConceptDef.commonMistakes). When set, REPLACES the code-level array (not merged).';
