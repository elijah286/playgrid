-- League registration intake (Track A, data core).
--
-- Additive + gated. All tables are RLS-scoped to league admins (+ the registering
-- guardian for their own submissions). No public surface is added here — the
-- parent-facing intake UI and Stripe Connect land in later Track A passes.

-- Player/registration lifecycle (mirrors the Agent 1 "Key States"):
--   submitted → approved → rostered | waitlisted | rejected | withdrawn
create type public.registration_status as enum (
  'submitted', 'approved', 'rostered', 'waitlisted', 'rejected', 'withdrawn'
);

create type public.registration_payment_status as enum (
  'unpaid', 'paid', 'refunded', 'waived'
);

-- ── Registration windows (when intake is open, league- or division-scoped) ───
create table public.registration_windows (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        not null references public.leagues(id) on delete cascade,
  division_id uuid        references public.league_divisions(id) on delete cascade,
  name        text        not null,
  opens_at    timestamptz,
  closes_at   timestamptz,
  -- Master switch; an operator can hard-close intake regardless of the dates.
  is_open     boolean     not null default false,
  settings    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index registration_windows_league_idx on public.registration_windows (league_id);

drop trigger if exists registration_windows_set_updated_at on public.registration_windows;
create trigger registration_windows_set_updated_at
  before update on public.registration_windows
  for each row execute function public.set_updated_at();

-- ── Player registrations (the core intake record) ────────────────────────────
create table public.player_registrations (
  id             uuid        primary key default gen_random_uuid(),
  league_id      uuid        not null references public.leagues(id) on delete cascade,
  division_id    uuid        references public.league_divisions(id) on delete set null,
  season_id      uuid        references public.seasons(id) on delete set null,
  player_id      uuid        references public.player_profiles(id) on delete set null,
  -- The guardian/parent user who submitted this registration.
  registered_by  uuid        references public.profiles(id) on delete set null,
  -- Set when the player is rostered to a league team.
  team_id        uuid        references public.teams(id) on delete set null,
  status         public.registration_status not null default 'submitted',
  payment_status public.registration_payment_status not null default 'unpaid',
  -- Computed eligibility snapshot: { eligible, unknown, reasons[] }. Soft signal
  -- (operator discretion) — eligibility does NOT hard-block registration.
  eligibility    jsonb       not null default '{}'::jsonb,
  requested_team  text,
  requested_coach text,
  friend_request  text,
  notes           text,
  submitted_at   timestamptz not null default now(),
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index player_registrations_league_status_idx
  on public.player_registrations (league_id, status);
create index player_registrations_division_idx
  on public.player_registrations (division_id);
create index player_registrations_player_idx
  on public.player_registrations (player_id);
create index player_registrations_registered_by_idx
  on public.player_registrations (registered_by);

drop trigger if exists player_registrations_set_updated_at on public.player_registrations;
create trigger player_registrations_set_updated_at
  before update on public.player_registrations
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.registration_windows enable row level security;

create policy registration_windows_select_member on public.registration_windows
  for select using (public.is_league_member(league_id) or public.is_site_admin());

create policy registration_windows_write_admin on public.registration_windows
  for all using (public.is_league_admin(league_id) or public.is_site_admin())
  with check (public.is_league_admin(league_id) or public.is_site_admin());

alter table public.player_registrations enable row level security;

-- A league admin sees all of their league's registrations; a guardian sees only
-- the ones they submitted.
create policy player_registrations_select on public.player_registrations
  for select using (
    public.is_league_admin(league_id) or registered_by = auth.uid()
  );

-- A guardian may submit a registration for themselves; admins may create any.
create policy player_registrations_insert on public.player_registrations
  for insert with check (
    public.is_league_admin(league_id) or registered_by = auth.uid()
  );

-- Status/roster decisions are admin-only.
create policy player_registrations_update_admin on public.player_registrations
  for update using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

create policy player_registrations_delete_admin on public.player_registrations
  for delete using (public.is_league_admin(league_id));
