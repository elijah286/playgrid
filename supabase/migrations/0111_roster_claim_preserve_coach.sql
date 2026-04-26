-- Coach-claims-a-player fix.
--
-- `playbook_members` rows are dual-purpose: each row is BOTH a user's
-- access to the playbook AND a roster slot. The partial unique index
-- (playbook_id, user_id) where user_id is not null forces one row per
-- user per playbook. So when a coach claims their own kid's roster
-- slot, the two rows have to merge.
--
-- 0082's `approve_roster_claim` and `link_roster_entry` did the merge
-- by deleting the coach's existing row and linking the user to the
-- (viewer) roster slot. That silently demoted the coach to viewer and
-- stripped is_head_coach/coach_title.
--
-- This migration rewrites both RPCs to copy the higher-privilege fields
-- onto the survivor row before deleting. Role is taken as the max of
-- (existing, slot) using owner > editor > viewer. is_head_coach,
-- coach_title, coach_upgrade_requested_at, and status='active' are
-- preserved if either side had them.
--
-- Then a one-shot backfill restores access for users who already lost
-- their coach row to this bug: for any playbook that no longer has any
-- member with role='owner', the earliest approved roster_claim's
-- claimer is promoted back to owner + is_head_coach=true.

-- Helper: rank roles so we can take max() in SQL.
create or replace function public._playbook_role_rank(r public.playbook_role)
returns int
language sql immutable as $$
  select case r
    when 'owner' then 3
    when 'editor' then 2
    when 'viewer' then 1
  end;
$$;

-- approve_roster_claim: merge instead of clobber.
create or replace function public.approve_roster_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  cl record;
  uid uuid := auth.uid();
  existing record;
  slot record;
  merged_role public.playbook_role;
  merged_status public.playbook_member_status;
  merged_head boolean;
  merged_title text;
  merged_upgrade timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  select rc.*, m.playbook_id, m.user_id as member_user_id
    into cl
  from public.roster_claims rc
  join public.playbook_members m on m.id = rc.member_id
  where rc.id = p_claim_id
  for update;

  if not found then raise exception 'claim_not_found' using errcode = 'P0008'; end if;
  if not public.can_edit_playbook(cl.playbook_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;
  if cl.status <> 'pending' then raise exception 'claim_not_pending' using errcode = 'P0009'; end if;
  if cl.member_user_id is not null then
    raise exception 'roster_entry_already_claimed' using errcode = 'P0005';
  end if;

  -- Pull both rows under FOR UPDATE so we can merge fields safely.
  select * into slot from public.playbook_members where id = cl.member_id for update;

  select * into existing
  from public.playbook_members
  where playbook_id = cl.playbook_id and user_id = cl.user_id
  for update;

  if found then
    -- Take max(role), keep coach flags + active status if either side had them.
    if public._playbook_role_rank(existing.role) >= public._playbook_role_rank(slot.role) then
      merged_role := existing.role;
    else
      merged_role := slot.role;
    end if;
    merged_status := case
      when existing.status = 'active' or slot.status = 'active' then 'active'::public.playbook_member_status
      else slot.status
    end;
    merged_head := existing.is_head_coach or slot.is_head_coach;
    merged_title := coalesce(existing.coach_title, slot.coach_title);
    merged_upgrade := coalesce(existing.coach_upgrade_requested_at, slot.coach_upgrade_requested_at);

    if existing.id <> slot.id then
      delete from public.playbook_members where id = existing.id;
    end if;
  else
    merged_role := slot.role;
    merged_status := slot.status;
    merged_head := slot.is_head_coach;
    merged_title := slot.coach_title;
    merged_upgrade := slot.coach_upgrade_requested_at;
  end if;

  update public.playbook_members
    set user_id = cl.user_id,
        role = merged_role,
        status = merged_status,
        is_head_coach = merged_head,
        coach_title = merged_title,
        coach_upgrade_requested_at = merged_upgrade
    where id = cl.member_id;

  update public.roster_claims
    set status = 'approved', decided_at = now(), decided_by = uid
    where id = cl.id;

  update public.roster_claims
    set status = 'rejected', decided_at = now(), decided_by = uid
    where member_id = cl.member_id and status = 'pending' and id <> cl.id;
end;
$$;

-- link_roster_entry: same merge logic for the manual-link shortcut.
create or replace function public.link_roster_entry(
  p_member_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  slot record;
  existing record;
  uid uuid := auth.uid();
  merged_role public.playbook_role;
  merged_status public.playbook_member_status;
  merged_head boolean;
  merged_title text;
  merged_upgrade timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  select * into slot from public.playbook_members where id = p_member_id for update;
  if not found then raise exception 'roster_entry_not_found' using errcode = 'P0004'; end if;
  if not public.can_edit_playbook(slot.playbook_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;
  if slot.user_id is not null then
    raise exception 'roster_entry_already_claimed' using errcode = 'P0005';
  end if;

  select * into existing
  from public.playbook_members
  where playbook_id = slot.playbook_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_on_playbook' using errcode = 'P0010';
  end if;

  if public._playbook_role_rank(existing.role) >= public._playbook_role_rank(slot.role) then
    merged_role := existing.role;
  else
    merged_role := slot.role;
  end if;
  merged_status := case
    when existing.status = 'active' or slot.status = 'active' then 'active'::public.playbook_member_status
    else slot.status
  end;
  merged_head := existing.is_head_coach or slot.is_head_coach;
  merged_title := coalesce(existing.coach_title, slot.coach_title);
  merged_upgrade := coalesce(existing.coach_upgrade_requested_at, slot.coach_upgrade_requested_at);

  if existing.id <> slot.id then
    delete from public.playbook_members where id = existing.id;
  end if;

  update public.playbook_members
    set user_id = p_user_id,
        role = merged_role,
        status = merged_status,
        is_head_coach = merged_head,
        coach_title = merged_title,
        coach_upgrade_requested_at = merged_upgrade
    where id = p_member_id;

  insert into public.roster_claims (
    member_id, user_id, status, decided_at, decided_by
  ) values (
    p_member_id, p_user_id, 'approved', now(), uid
  );
end;
$$;

-- Backfill: restore owner access on playbooks that lost their owner row
-- to the pre-fix demotion. For each such playbook, promote the user
-- whose approved claim was decided earliest (the most likely original
-- coach who first claimed a player). Idempotent: re-running this finds
-- nothing to do.
do $$
declare
  pb record;
  victim record;
begin
  for pb in
    select id from public.playbooks
    where not exists (
      select 1 from public.playbook_members m
      where m.playbook_id = playbooks.id and m.role = 'owner'
    )
  loop
    select rc.user_id, rc.decided_at
      into victim
    from public.roster_claims rc
    join public.playbook_members m on m.id = rc.member_id
    where m.playbook_id = pb.id
      and rc.status = 'approved'
    order by rc.decided_at asc
    limit 1;

    if found then
      update public.playbook_members
        set role = 'owner',
            is_head_coach = true,
            status = 'active'
        where playbook_id = pb.id and user_id = victim.user_id;
    end if;
  end loop;
end $$;

grant execute on function public._playbook_role_rank(public.playbook_role) to authenticated;
