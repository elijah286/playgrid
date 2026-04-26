-- Players (viewer role) no longer consume seats — only Coach (editor)
-- collaborators do. Free, unlimited player invites for Team Coach owners;
-- the seat cap exclusively governs how many additional editing coaches
-- the owner has granted access to.

create or replace function public.seats_used(p_owner_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct m.user_id)::int
  from public.playbook_members m
  left join public.user_entitlements e on e.user_id = m.user_id
  where m.user_id <> p_owner_id
    and m.role = 'editor'
    and m.status = 'active'
    and (e.tier is null or e.tier = 'free')
    and exists (
      select 1
      from public.playbook_members owner_m
      where owner_m.playbook_id = m.playbook_id
        and owner_m.user_id = p_owner_id
        and owner_m.role = 'owner'
        and owner_m.status = 'active'
    )
$$;
