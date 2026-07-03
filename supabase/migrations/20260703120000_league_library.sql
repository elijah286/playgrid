-- League content library (Phase 1 of docs/league-platform/LIBRARY-DISTRIBUTION-PLAN.md).
--
-- The operator's org-level registry of shareable content. Items POINT AT
-- content the operator authors in their own coach playbooks (play groups /
-- practice plans) — the library is metadata, not a second content store.
-- Distribution (Phase 2) copies snapshots from the source into team
-- playbooks; deleting a source later doesn't break distributed copies.
--
-- Additive only: no coach-core tables touched.

create table public.league_library_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('play_group', 'practice_plan')),
  source_playbook_id uuid not null references public.playbooks (id) on delete cascade,
  -- Exactly one of the two source pointers, matching kind.
  source_group_id uuid references public.playbook_groups (id) on delete cascade,
  source_practice_plan_id uuid references public.practice_plans (id) on delete cascade,
  title text not null,
  sport text not null default 'football',
  variant text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint league_library_items_source_matches_kind check (
    (kind = 'play_group' and source_group_id is not null and source_practice_plan_id is null)
    or (kind = 'practice_plan' and source_practice_plan_id is not null and source_group_id is null)
  )
);

create index league_library_items_owner_idx on public.league_library_items (owner_id);
create unique index league_library_items_group_uniq
  on public.league_library_items (owner_id, source_group_id)
  where source_group_id is not null;
create unique index league_library_items_plan_uniq
  on public.league_library_items (owner_id, source_practice_plan_id)
  where source_practice_plan_id is not null;

-- Defaults: apply this item to every NEW team whose game type matches the
-- item's variant — org-wide (league_id null) or for one league. (The plan doc
-- sketched variant on this table too; it lives on the item, so the default
-- row is just item × scope — the variant match happens at application time.)
create table public.league_library_defaults (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.league_library_items (id) on delete cascade,
  league_id uuid references public.leagues (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index league_library_defaults_org_uniq
  on public.league_library_defaults (item_id)
  where league_id is null;
create unique index league_library_defaults_league_uniq
  on public.league_library_defaults (item_id, league_id)
  where league_id is not null;
create index league_library_defaults_owner_idx on public.league_library_defaults (owner_id);

alter table public.league_library_items enable row level security;
alter table public.league_library_defaults enable row level security;

-- Owner-scoped, like league_access_grants: the operator manages their own
-- library. (Delegate access via manage_curriculum can come later.)
create policy library_items_owner_all on public.league_library_items
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy library_defaults_owner_all on public.league_library_defaults
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
