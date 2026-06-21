-- League announcements / broadcasts (Track B — communications).
--
-- Additive + gated. New table, league-scoped RLS. Stores each announcement the
-- operator sends + a record of how many recipients it reached. Audience is text
-- (today: 'coaches'; parents/division/team follow with registration).

create table public.league_broadcasts (
  id              uuid        primary key default gen_random_uuid(),
  league_id       uuid        not null references public.leagues(id) on delete cascade,
  audience        text        not null default 'coaches',
  title           text        not null,
  body            text        not null,
  recipient_count integer     not null default 0,
  sent_at         timestamptz,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index league_broadcasts_league_idx on public.league_broadcasts (league_id, created_at desc);

alter table public.league_broadcasts enable row level security;

create policy league_broadcasts_select_member on public.league_broadcasts
  for select using (public.is_league_member(league_id) or public.is_site_admin());

create policy league_broadcasts_write_admin on public.league_broadcasts
  for all using (public.is_league_admin(league_id) or public.is_site_admin())
  with check (public.is_league_admin(league_id) or public.is_site_admin());
