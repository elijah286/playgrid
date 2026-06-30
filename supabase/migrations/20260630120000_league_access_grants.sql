-- Delegated administration (Phase 1): scoped access grants for league operators.
--
-- An operator (portfolio owner) grants another person a ROLE (a bundle of
-- capabilities) at a SCOPE (portfolio / specific leagues / a sport / a group).
-- Additive + gated; no existing table changes. Enforcement (wiring `can()` into
-- the action gates) is Phase 2 — this just stores + exposes the grants.

create table public.league_access_grants (
  id              uuid        primary key default gen_random_uuid(),
  -- The operator who owns this grant (the portfolio root).
  owner_id        uuid        not null references auth.users(id) on delete cascade,
  -- Invited by email; linked to a user id once that email has an account.
  member_email    text        not null,
  member_user_id  uuid        references auth.users(id) on delete set null,
  -- Display role preset ('admin', 'merch_manager', …, or 'custom'); the actual
  -- permissions are the resolved capabilities array (source of truth).
  role            text        not null default 'custom',
  capabilities    text[]      not null default '{}',
  -- Scope: 'portfolio' (all) | 'leagues' (explicit list) | 'sport' | 'group'.
  scope_kind      text        not null default 'portfolio',
  scope_leagues   uuid[]      not null default '{}',
  scope_sport     text,
  scope_group_id  uuid        references public.league_groups(id) on delete set null,
  status          text        not null default 'invited',  -- invited | active | revoked
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, member_email)
);

create index league_access_grants_owner_idx on public.league_access_grants (owner_id);
create index league_access_grants_member_idx
  on public.league_access_grants (member_user_id) where member_user_id is not null;

alter table public.league_access_grants enable row level security;

-- The portfolio owner manages their own grants (read + write).
drop policy if exists league_access_grants_owner_all on public.league_access_grants;
create policy league_access_grants_owner_all on public.league_access_grants
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- A member may read grants addressed to them (to learn their own access).
drop policy if exists league_access_grants_member_read on public.league_access_grants;
create policy league_access_grants_member_read on public.league_access_grants
  for select using (member_user_id = auth.uid());
