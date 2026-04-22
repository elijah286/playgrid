-- Track cumulative time-on-site per profile. Used by the feedback pill
-- eligibility gate (server-trusted) and surfaced in the admin user panel.

alter table public.profiles
  add column if not exists total_seconds_on_site bigint not null default 0,
  add column if not exists last_active_at timestamptz;

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
  -- Clamp so a client can't fast-forward more than 10 minutes per call.
  if p_delta > 600 then
    p_delta := 600;
  end if;
  update public.profiles
     set total_seconds_on_site = coalesce(total_seconds_on_site, 0) + p_delta,
         last_active_at = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.increment_time_on_site(integer) to authenticated;
