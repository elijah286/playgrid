-- Library concept overrides — per-(slug, variant) admin edits that
-- sit on top of the code-generated catalog skeleton.
--
-- Background. Library pages at /learn/library/plays/[slug]/[variant]
-- render `coachDiagramToPlayDocument(playSpecToCoachDiagram(skeleton))`
-- where `skeleton` is `generateConceptSkeleton(concept.name, ...)`
-- from `src/domain/play/conceptSkeleton.ts`. That's pure code-derived
-- — perfect for the catalog's tactical "shape" but it locks the
-- diagram into whatever the generator emits. Coaches walking the
-- catalog naturally want to nudge players a yard, swap a route, or
-- tighten the splits to match how THEY teach the concept.
--
-- This table is the diff layer. When a row exists for (slug, variant),
-- the library page reads the stored `document` instead of the
-- skeleton-derived one. Coach-authored notes (the markdown the
-- editor's PlayerMentionEditor produces, with @LABEL chips) live in
-- `coach_notes`, also overlaid on top of the spec-projected default
-- when present.
--
-- One row per (slug, variant). Catalog edits propagate to all
-- variants that haven't been overridden; admin edits override a
-- single variant. There's no "concept-level override that affects
-- all variants" — different variants have different player counts
-- and route depths, so the geometric edits don't translate. If we
-- want a "rename this concept across all variants" path later, that
-- belongs in the catalog source, not this table.
--
-- RLS. Reads are public (anon + signed-in) — library pages are
-- ungated content, same as the catalog. Writes are admin-only via
-- `public.is_site_admin()` (added 0003). Service role writes are
-- always allowed (used by the upcoming migration that promotes
-- existing in-app plays to library overrides).

create table public.library_concept_overrides (
  slug         text not null,
  variant      text not null,
  document     jsonb not null,
  coach_notes  text,
  updated_at   timestamptz not null default now(),
  -- `auth.users.id` is the canonical FK; we keep it nullable so a
  -- service-role seed (no acting user) can populate the table.
  updated_by   uuid references auth.users(id) on delete set null,
  primary key (slug, variant)
);

create index if not exists library_concept_overrides_updated_at_idx
  on public.library_concept_overrides (updated_at desc);

alter table public.library_concept_overrides enable row level security;

-- Public read. Library pages render server-side; anon and signed-in
-- both need to see the override row. No PII in the document, no
-- privacy concern.
create policy library_concept_overrides_select_public
  on public.library_concept_overrides for select
  using (true);

-- Admin-only insert / update / delete. `is_site_admin()` is the
-- same gate `system_notices` and the admin server actions use.
create policy library_concept_overrides_insert_admin
  on public.library_concept_overrides for insert
  with check (public.is_site_admin());

create policy library_concept_overrides_update_admin
  on public.library_concept_overrides for update
  using (public.is_site_admin())
  with check (public.is_site_admin());

create policy library_concept_overrides_delete_admin
  on public.library_concept_overrides for delete
  using (public.is_site_admin());

-- Trigger to keep `updated_at` honest. Belt-and-suspenders with the
-- default — the server action sets it explicitly on every write, but
-- a malformed admin client that omits it shouldn't end up with a
-- stale row.
create or replace function public.library_concept_overrides_touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists library_concept_overrides_touch on public.library_concept_overrides;
create trigger library_concept_overrides_touch
  before update on public.library_concept_overrides
  for each row execute function public.library_concept_overrides_touch_updated_at();
