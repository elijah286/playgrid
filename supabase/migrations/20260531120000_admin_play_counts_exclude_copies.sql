-- The Plays column in admin Users tab was inflating engagement by counting
-- every play a user inherited via copy / playbook-claim. Those rows get a
-- play_version with created_by = recipient and label = 'copied' (see
-- src/lib/data/playbook-copy.ts and copyPlay in src/app/actions/plays.ts).
-- A play that's *only* ever been copied is not authorship — restrict the
-- aggregate to versions whose label is not 'copied'. A copied-then-edited
-- play still counts because the subsequent edit version has a different
-- label.

create or replace function public.admin_play_counts_by_user()
returns table (user_id uuid, plays_created int)
language sql
security definer
set search_path = public
as $$
  select created_by as user_id, count(distinct play_id)::int as plays_created
  from public.play_versions
  where created_by is not null
    and (label is null or label <> 'copied')
  group by created_by;
$$;
