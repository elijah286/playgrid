-- The pm_select_unclaimed policy added in 0082 does a subquery on
-- playbook_members from within a policy on playbook_members. Postgres
-- re-evaluates RLS on that subquery and recurses → "infinite recursion
-- detected in policy for relation playbook_members".
--
-- Fix: move the membership check into a security-definer helper so the
-- subquery bypasses RLS. Keep the predicate identical otherwise: a
-- caller sees unclaimed roster entries on a playbook they already
-- belong to (pending OR active — they need the list during the invite
-- accept flow before approval lands).

create or replace function public.has_any_playbook_membership(pb uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playbook_members
    where playbook_id = pb and user_id = auth.uid()
  );
$$;

grant execute on function public.has_any_playbook_membership(uuid) to authenticated;

drop policy if exists pm_select_unclaimed on public.playbook_members;

create policy pm_select_unclaimed on public.playbook_members
  for select using (
    user_id is null
    and public.has_any_playbook_membership(playbook_id)
  );
