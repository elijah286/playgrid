-- Distribution ledger (Phase 2 of docs/league-platform/LIBRARY-DISTRIBUTION-PLAN.md).
-- One row per library-item snapshot distributed into a team playbook. Powers
-- the per-league status board ("what from my library is on which team") and
-- makes redistribution auditable. item_id is SET NULL on library-item removal
-- so history survives; title_snapshot keeps the display name.
-- Additive only: no coach-core tables touched.

create table public.league_distributions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references public.league_library_items (id) on delete set null,
  kind text not null check (kind in ('play_group', 'practice_plan', 'starter_playbook')),
  title_snapshot text not null,
  league_id uuid not null references public.leagues (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  target_playbook_id uuid not null references public.playbooks (id) on delete cascade,
  target_group_id uuid references public.playbook_groups (id) on delete set null,
  distributed_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index league_distributions_owner_idx on public.league_distributions (owner_id);
create index league_distributions_league_idx on public.league_distributions (league_id);
create index league_distributions_team_idx on public.league_distributions (team_id);
create index league_distributions_item_idx on public.league_distributions (item_id);

alter table public.league_distributions enable row level security;

create policy league_distributions_owner_all on public.league_distributions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
