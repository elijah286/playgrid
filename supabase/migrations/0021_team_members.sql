-- Phase 1 of Teams feature: per-team membership records.
--
-- Conceptually distinct from playbook_members (0017): a team_member represents
-- a person who belongs to the team (player, coach, guest), independent of which
-- specific playbooks they have access to. Playbook-level access stays
-- authoritative for RLS reads on plays.
--
-- This migration is read/manage-only by org owners. Invites, minors handling,
-- and player-side write paths come in later phases.

create type public.team_member_role as enum ('coach', 'player', 'guest');

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  role public.team_member_role not null default 'player',
  -- Display label for the person on this team (e.g. "Jamal #12"). For unlinked
  -- roster entries (no user_id yet), this is the only identifying field.
  label text,
  jersey_number text,
  position text,
  -- Coach-declared at invite time (Phase 2). Defaults false; under-13 path will
  -- set this and route to the parental-consent flow.
  is_minor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index team_members_team_idx on public.team_members (team_id);
create index team_members_user_idx on public.team_members (user_id);

alter table public.team_members enable row level security;

-- Phase 1 access: org owners can do anything with their team's roster. Linked
-- users can see their own membership row. Player-side writes come later.

create policy team_members_select_owner on public.team_members
  for select using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

create policy team_members_select_self on public.team_members
  for select using (user_id = auth.uid());

create policy team_members_write_owner on public.team_members
  for all using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

create or replace function public.team_members_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger team_members_updated_at
  before update on public.team_members
  for each row execute function public.team_members_set_updated_at();
