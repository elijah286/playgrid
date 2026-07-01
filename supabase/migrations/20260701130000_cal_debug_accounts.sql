-- Coach Cal debug-tools access — lets a site admin grant a specific account
-- the same Cal debugging affordances admins get (download the full chat
-- thread, copy the raw JSON of a response) without making them a site admin.
-- Mirrors the league_organizers pattern (20260620130000): additive, reversible,
-- profiles.role untouched.

create table public.cal_debug_accounts (
  user_id     uuid        primary key references public.profiles(id) on delete cascade,
  granted_by  uuid        references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  note        text
);

-- Does a user have Cal debug tools enabled? Defaults to the current user.
create or replace function public.has_cal_debug_access(uid uuid default auth.uid())
returns boolean as $$
  select exists (
    select 1 from public.cal_debug_accounts a where a.user_id = uid
  );
$$ language sql stable security definer set search_path = public;

alter table public.cal_debug_accounts enable row level security;

-- Site admins manage the list; a user may read their own debug-access status.
create policy cal_debug_accounts_select on public.cal_debug_accounts
  for select using (public.is_site_admin() or user_id = auth.uid());

create policy cal_debug_accounts_write_admin on public.cal_debug_accounts
  for all using (public.is_site_admin())
  with check (public.is_site_admin());
