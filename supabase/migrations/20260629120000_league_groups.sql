-- League groups: an operator's grouping of their own leagues (e.g. "Waco, TX"),
-- for navigation and cross-league messaging. Additive + gated. A league can
-- belong to many groups (many-to-many).

create table public.league_groups (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now()
);
create index league_groups_owner_idx on public.league_groups (owner_id);

create table public.league_group_members (
  group_id   uuid        not null references public.league_groups(id) on delete cascade,
  league_id  uuid        not null references public.leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, league_id)
);
create index league_group_members_league_idx on public.league_group_members (league_id);

alter table public.league_groups enable row level security;
alter table public.league_group_members enable row level security;

-- A group is private to the operator who created it.
create policy league_groups_owner_all on public.league_groups
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Membership: readable by the group owner; writable only when the owner also
-- administers the league being added (so you can't group a league you don't run).
create policy league_group_members_select on public.league_group_members
  for select using (
    exists (select 1 from public.league_groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy league_group_members_write on public.league_group_members
  for all using (
    exists (select 1 from public.league_groups g where g.id = group_id and g.owner_id = auth.uid())
    and public.is_league_admin(league_id)
  )
  with check (
    exists (select 1 from public.league_groups g where g.id = group_id and g.owner_id = auth.uid())
    and public.is_league_admin(league_id)
  );
