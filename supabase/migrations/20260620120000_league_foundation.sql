-- League platform foundation (Wave 0): tenancy, roles, membership, RLS helpers.
--
-- ADDITIVE + GATED + REVERSIBLE. The existing coach product is untouched:
--   * teams / seasons gain a NULLABLE league_id; existing rows stay NULL and are
--     invisible to every league query.
--   * league_* tables are RLS-scoped to league_members; non-members (i.e. every
--     existing user) get zero rows.
--   * profiles.role is NOT modified — league roles live in league_members so the
--     ~30 global admin actions and is_site_admin() are entirely unaffected.

-- ── Enums ────────────────────────────────────────────────────────────────────
-- Sport is intentionally an enum so the schema stays sport-agnostic (no
-- football-only columns anywhere in the league tables).
create type public.league_sport as enum (
  'football', 'soccer', 'baseball', 'volleyball', 'basketball', 'other'
);

-- Canonical role vocabulary for the whole platform lives HERE (not profiles.role).
create type public.league_member_role as enum (
  'operator', 'league_admin', 'coach', 'parent', 'player', 'volunteer'
);

-- ── Leagues (top-level tenancy) ──────────────────────────────────────────────
create table public.leagues (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        unique,
  sport       public.league_sport not null default 'football',
  -- Branding cascade (league → team → playbook); shape mirrors teams.theme.
  branding    jsonb       not null default '{}'::jsonb,
  -- Sport-agnostic settings bag so we never bolt sport-specific columns on here.
  settings    jsonb       not null default '{}'::jsonb,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

drop trigger if exists leagues_set_updated_at on public.leagues;
create trigger leagues_set_updated_at
  before update on public.leagues
  for each row execute function public.set_updated_at();

-- ── Divisions / age groups ───────────────────────────────────────────────────
create table public.league_divisions (
  id              uuid        primary key default gen_random_uuid(),
  league_id       uuid        not null references public.leagues(id) on delete cascade,
  name            text        not null,
  -- Eligibility as data (birthdate windows), never football-specific columns.
  min_birthdate   date,
  max_birthdate   date,
  max_roster_size integer,
  sort_order      integer     not null default 0,
  settings        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create index league_divisions_league_idx
  on public.league_divisions (league_id)
  where archived_at is null;

drop trigger if exists league_divisions_set_updated_at on public.league_divisions;
create trigger league_divisions_set_updated_at
  before update on public.league_divisions
  for each row execute function public.set_updated_at();

-- ── Membership (one row per (league, user, role); a person may be coach AND parent)
create table public.league_members (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        not null references public.leagues(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  role        public.league_member_role not null,
  created_at  timestamptz not null default now(),
  unique (league_id, user_id, role)
);

create index league_members_league_idx on public.league_members (league_id);
create index league_members_user_idx on public.league_members (user_id);

-- ── teams / seasons gain a NULLABLE league_id (additive; existing rows stay NULL)
alter table public.teams
  add column if not exists league_id uuid references public.leagues(id) on delete set null;
create index if not exists teams_league_idx
  on public.teams (league_id) where league_id is not null;

-- A league team may belong to a division (nullable; coach teams never do).
alter table public.teams
  add column if not exists league_division_id uuid references public.league_divisions(id) on delete set null;

alter table public.seasons
  add column if not exists league_id uuid references public.leagues(id) on delete set null;
create index if not exists seasons_league_idx
  on public.seasons (league_id) where league_id is not null;

-- ── RLS helper functions (security definer → they bypass RLS, so no recursion) ─
create or replace function public.is_league_member(p_league uuid)
returns boolean as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league and m.user_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.is_league_admin(p_league uuid)
returns boolean as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league and m.user_id = auth.uid()
      and m.role in ('operator', 'league_admin')
  );
$$ language sql stable security definer set search_path = public;

-- "Does the current user have ANY league access?" — the surface gate predicate.
create or replace function public.has_league_access()
returns boolean as $$
  select exists (
    select 1 from public.league_members m where m.user_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

-- ── RLS: leagues ─────────────────────────────────────────────────────────────
alter table public.leagues enable row level security;

create policy leagues_select_member on public.leagues
  for select using (public.is_league_member(id) or public.is_site_admin());

-- Inserts require admin-of-the-league, which is impossible pre-membership, so
-- league creation only happens via the service-role client (seed + future
-- operator-onboarding action). Normal users can never create a league via RLS.
create policy leagues_write_admin on public.leagues
  for all using (public.is_league_admin(id) or public.is_site_admin())
  with check (public.is_league_admin(id) or public.is_site_admin());

-- ── RLS: league_divisions ────────────────────────────────────────────────────
alter table public.league_divisions enable row level security;

create policy league_divisions_select_member on public.league_divisions
  for select using (public.is_league_member(league_id) or public.is_site_admin());

create policy league_divisions_write_admin on public.league_divisions
  for all using (public.is_league_admin(league_id) or public.is_site_admin())
  with check (public.is_league_admin(league_id) or public.is_site_admin());

-- ── RLS: league_members ──────────────────────────────────────────────────────
alter table public.league_members enable row level security;

create policy league_members_select_member on public.league_members
  for select using (
    public.is_league_member(league_id) or user_id = auth.uid() or public.is_site_admin()
  );

create policy league_members_write_admin on public.league_members
  for all using (public.is_league_admin(league_id) or public.is_site_admin())
  with check (public.is_league_admin(league_id) or public.is_site_admin());
