-- League organizer entitlement — the Layer-1 access gate for the league product.
--
-- A user can see/use the league operator surface ONLY when a SITE ADMIN marks
-- them a "league organizer". This is independent of league_members (which scopes
-- WHICH leagues a user runs). Additive + gated + reversible: no existing table is
-- changed, and a non-organizer (every current user) gets zero league access.
--
-- profiles.role is NOT touched — site-admin authority stays exactly as is.

create table public.league_organizers (
  user_id     uuid        primary key references public.profiles(id) on delete cascade,
  granted_by  uuid        references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  note        text
);

-- Is a user a league organizer? Defaults to the current user (for RLS / the gate).
create or replace function public.is_league_organizer(uid uuid default auth.uid())
returns boolean as $$
  select exists (
    select 1 from public.league_organizers o where o.user_id = uid
  );
$$ language sql stable security definer set search_path = public;

alter table public.league_organizers enable row level security;

-- Site admins manage the list; a user may read their own organizer status.
create policy league_organizers_select on public.league_organizers
  for select using (public.is_site_admin() or user_id = auth.uid());

create policy league_organizers_write_admin on public.league_organizers
  for all using (public.is_site_admin())
  with check (public.is_site_admin());

-- ── Organizer self-service: create a league ──────────────────────────────────
-- Security-definer so an organizer can bootstrap a league (the leagues RLS only
-- permits writes by existing league admins, which is impossible pre-membership).
-- Authorization is enforced explicitly: caller must be a league organizer.
create or replace function public.create_league(
  p_name  text,
  p_sport public.league_sport default 'football'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null or not public.is_league_organizer(v_uid) then
    raise exception 'not authorized: caller is not a league organizer';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'league name is required';
  end if;

  insert into public.leagues (name, sport, created_by)
  values (btrim(p_name), p_sport, v_uid)
  returning id into v_id;

  insert into public.league_members (league_id, user_id, role)
  values (v_id, v_uid, 'operator');

  return v_id;
end;
$$;
