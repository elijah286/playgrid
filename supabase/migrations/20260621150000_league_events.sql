-- League schedule: games, practices, and events (Track B).
--
-- Additive + gated. New table, league-scoped RLS; no existing table is touched.

create type public.league_event_kind as enum ('practice', 'game', 'event', 'other');

create table public.league_events (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        not null references public.leagues(id) on delete cascade,
  division_id uuid        references public.league_divisions(id) on delete set null,
  team_id     uuid        references public.teams(id) on delete set null,
  kind        public.league_event_kind not null default 'event',
  title       text        not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,
  opponent    text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index league_events_league_starts_idx on public.league_events (league_id, starts_at);

drop trigger if exists league_events_set_updated_at on public.league_events;
create trigger league_events_set_updated_at
  before update on public.league_events
  for each row execute function public.set_updated_at();

alter table public.league_events enable row level security;

create policy league_events_select_member on public.league_events
  for select using (public.is_league_member(league_id) or public.is_site_admin());

create policy league_events_write_admin on public.league_events
  for all using (public.is_league_admin(league_id) or public.is_site_admin())
  with check (public.is_league_admin(league_id) or public.is_site_admin());
