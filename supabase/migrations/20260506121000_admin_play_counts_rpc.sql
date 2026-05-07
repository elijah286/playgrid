-- Aggregate distinct (user, play) pairs from play_versions in SQL so the
-- admin user list does not bump into PostgREST's max_rows=1000 cap when
-- pulling rows client-side. The previous list query truncated silently and
-- under-counted plays for users whose versions fell beyond the first 1000
-- rows returned.

create or replace function public.admin_play_counts_by_user()
returns table (user_id uuid, plays_created int)
language sql
security definer
set search_path = public
as $$
  select created_by as user_id, count(distinct play_id)::int as plays_created
  from public.play_versions
  where created_by is not null
  group by created_by;
$$;
