-- Standard division segments: gender + age band + an active flag.
--
-- ADDITIVE + GATED + REVERSIBLE. Every new column has a default, so existing
-- league_divisions rows become Co-ed / no-age-band / active with no backfill.
--
-- Why these columns (and not a football-specific shape): divisions are a
-- Gender × Age grid every league starts from. Gender + age_group make the grid
-- structured (the app seeds Co-ed and lets operators toggle Boys/Girls on
-- demand); `active` lets an operator keep a division in the catalog but mark it
-- off for the current season without losing its birthdate window or roster cap.

-- Gender segment. Guarded so the migration is safe to re-run.
do $$ begin
  create type public.league_division_gender as enum ('coed', 'boys', 'girls');
exception when duplicate_object then null;
end $$;

alter table public.league_divisions
  add column if not exists gender     public.league_division_gender not null default 'coed',
  add column if not exists age_group  text,
  add column if not exists active     boolean not null default true;

-- One standard (gender, age_group) segment per league among LIVE rows. Custom
-- divisions (age_group is null) are unconstrained, and archived rows are excluded
-- so re-adding a previously-archived segment works.
create unique index if not exists league_divisions_segment_uniq
  on public.league_divisions (league_id, gender, age_group)
  where age_group is not null and archived_at is null;
