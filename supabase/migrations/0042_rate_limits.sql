-- Simple DB-backed sliding-window rate limiter.
--
-- Used to throttle unauthenticated server actions (account-existence
-- lookup, contact form) that would otherwise be open to enumeration or
-- abuse. Callers pass a bucket key (e.g. "auth-lookup:<ip>") plus a
-- window and max; the function atomically increments and returns whether
-- the request is allowed.

create table if not exists public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

create or replace function public.rate_limit_check(
  p_bucket text,
  p_window_seconds integer,
  p_max integer
)
returns boolean
as $$
declare
  row_count integer;
  row_start timestamptz;
begin
  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set
      window_start = case
        when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
        else public.rate_limits.window_start
      end,
      count = case
        when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
        else public.rate_limits.count + 1
      end
  returning count, window_start into row_count, row_start;

  return row_count <= p_max;
end;
$$ language plpgsql security definer set search_path = public;

-- Opportunistic cleanup — keep the table small.
create or replace function public.rate_limits_sweep()
returns void
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$ language sql security definer set search_path = public;

grant execute on function public.rate_limit_check(text, integer, integer) to anon, authenticated;
