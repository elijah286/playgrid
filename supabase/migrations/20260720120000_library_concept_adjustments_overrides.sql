-- Library concept "when-not" / "adjustments" overrides — extends the
-- metadata-override columns added in 20260526150000.
--
-- Background. The content-enrichment pass added two new concept-level
-- prose fields to ConceptDef (whenNotToUse, situationalAdjustments) —
-- rendered on the public library page next to the existing "When to
-- call it" / "Common mistakes" sections. As with the other concept
-- prose, admins need a per-(slug,variant) override so they can tune the
-- wording via the inline text editor without a deploy.
--
-- Same fallback chain as the other *_override columns: when the column
-- is set it REPLACES the code-level ConceptDef field; a null/empty
-- column means "use the code default". Variant-keyed (one row per
-- slug+variant) so 5v5 Mesh and tackle Mesh can carry different
-- adjustments. Additive, non-destructive DDL.

alter table public.library_concept_overrides
  -- "When NOT to call it" — the inverse of when_to_use. Maps to
  -- ConceptDef.whenNotToUse.
  add column if not exists when_not_to_use_override text,
  -- "How to adjust for situations" (down & distance, coverage, or game
  -- variant). Maps to ConceptDef.situationalAdjustments.
  add column if not exists situational_adjustments_override text;

comment on column public.library_concept_overrides.when_not_to_use_override is
  'When set, replaces ConceptDef.whenNotToUse on library pages.';
comment on column public.library_concept_overrides.situational_adjustments_override is
  'When set, replaces ConceptDef.situationalAdjustments on library pages.';
