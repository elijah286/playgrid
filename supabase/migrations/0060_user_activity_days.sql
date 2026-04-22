-- Per-day activity record. The time-on-site tracker heartbeats every few
-- minutes via increment_time_on_site(); we piggyback on that to mark the
-- current calendar day as active for the caller. Distinct-days-in-last-30
-- is a much better engagement signal than a single last_active_at timestamp.

create table if not exists public.user_activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

create index if not exists user_activity_days_user_day_idx
  on public.user_activity_days (user_id, day desc);

alter table public.user_activity_days enable row level security;

drop policy if exists "user_activity_days self read" on public.user_activity_days;
create policy "user_activity_days self read"
  on public.user_activity_days for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_activity_days admin read" on public.user_activity_days;
create policy "user_activity_days admin read"
  on public.user_activity_days for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Extend the heartbeat RPC to also record today in user_activity_days.
create or replace function public.increment_time_on_site(p_delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_delta is null or p_delta <= 0 then
    return;
  end if;
  if p_delta > 600 then
    p_delta := 600;
  end if;
  update public.profiles
     set total_seconds_on_site = coalesce(total_seconds_on_site, 0) + p_delta,
         last_active_at = now()
   where id = auth.uid();

  insert into public.user_activity_days (user_id, day)
  values (auth.uid(), (now() at time zone 'utc')::date)
  on conflict do nothing;
end;
$$;
