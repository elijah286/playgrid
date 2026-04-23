-- Coach-access request on a player membership.
--
-- When a user accepts a player invite but identifies themselves as a coach,
-- we stamp this column so the playbook owner sees a pending request to
-- upgrade the member from viewer -> editor. Approving flips role to editor
-- and clears the stamp; denying just clears the stamp (keeps player access).

alter table public.playbook_members
  add column if not exists coach_upgrade_requested_at timestamptz;

create index if not exists playbook_members_coach_upgrade_requested_idx
  on public.playbook_members (playbook_id)
  where coach_upgrade_requested_at is not null;

-- Self-service RPC: a signed-in user can stamp their own row to request a
-- coach upgrade. pm_update RLS only lets editors/owners write, so we go
-- through security definer like set_my_positions. Only stamps the column;
-- role/status are unaffected.
create or replace function public.request_coach_upgrade(
  p_playbook_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  update public.playbook_members
  set coach_upgrade_requested_at = coalesce(coach_upgrade_requested_at, now())
  where playbook_id = p_playbook_id and user_id = uid;

  if not found then
    raise exception 'No membership on this playbook';
  end if;
end;
$$;

grant execute on function public.request_coach_upgrade(uuid) to authenticated;
