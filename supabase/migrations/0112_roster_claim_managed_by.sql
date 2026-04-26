-- Coach-claims-a-player, take 2: separate "who plays this slot" from
-- "who manages this slot."
--
-- 0111 merged the claimer's access row into the roster slot, which
-- collapses two distinct identities (coach Elijah, player Asher) into
-- one row labeled with the player's name. This migration introduces a
-- `managed_by` link on the slot itself: a coach/parent claims a slot
-- as its manager without their own access row being touched.
--
-- - user_id  on a slot = "this slot IS this user" (adult player on
--   their own account).
-- - managed_by on a slot = "this user (parent/guardian/coach) is
--   responsible for this slot's player" — common case for minors.
--
-- Both can be set: a kid with their own login whose parent still
-- manages notifications.

alter table public.playbook_members
  add column if not exists managed_by uuid references public.profiles (id) on delete set null;

create index if not exists playbook_members_managed_by_idx
  on public.playbook_members (managed_by)
  where managed_by is not null;

-- A claim records which mode it was: as_manager=true means link as
-- managed_by; as_manager=false means merge into the player slot. The
-- claimer chooses at submit time; coach approves the chosen mode.
alter table public.roster_claims
  add column if not exists as_manager boolean not null default true;

-- Drop old signatures so the new defaults aren't shadowed by overloads.
drop function if exists public.submit_roster_claim(uuid, text);
drop function if exists public.link_roster_entry(uuid, uuid);

-- submit_roster_claim now accepts the mode. Default is manager (the
-- common case: a parent claiming their kid). Adult players claiming
-- their own slot pass false to keep the legacy merge behavior.
create or replace function public.submit_roster_claim(
  p_member_id uuid,
  p_note text default null,
  p_as_manager boolean default true
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  target record;
  uid uuid := auth.uid();
  claim_id uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  select m.id, m.playbook_id, m.user_id, m.is_minor
    into target
  from public.playbook_members m
  where m.id = p_member_id
  for update;

  if not found then raise exception 'roster_entry_not_found' using errcode = 'P0004'; end if;
  if target.user_id is not null then raise exception 'roster_entry_already_claimed' using errcode = 'P0005'; end if;

  if not exists (
    select 1 from public.playbook_members
    where playbook_id = target.playbook_id and user_id = uid
  ) then
    raise exception 'not_a_member' using errcode = 'P0006';
  end if;

  if exists (
    select 1 from public.roster_claims rc
    join public.playbook_members m on m.id = rc.member_id
    where rc.user_id = uid
      and rc.status = 'pending'
      and m.playbook_id = target.playbook_id
  ) then
    raise exception 'claim_already_pending' using errcode = 'P0007';
  end if;

  insert into public.roster_claims (member_id, user_id, note, as_manager)
  values (
    p_member_id,
    uid,
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_as_manager, true)
  )
  returning id into claim_id;

  return claim_id;
end;
$$;

-- approve_roster_claim: if claim.as_manager, just set managed_by on
-- the slot. The claimer's existing access row is untouched. Otherwise
-- fall through to the 0111 merge (player IS the slot).
create or replace function public.approve_roster_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  cl record;
  uid uuid := auth.uid();
  slot record;
  existing record;
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

  if cl.as_manager then
    update public.playbook_members
      set managed_by = cl.user_id
      where id = cl.member_id;
  else
    select * into slot from public.playbook_members where id = cl.member_id for update;

    select * into existing
    from public.playbook_members
    where playbook_id = cl.playbook_id and user_id = cl.user_id
    for update;

    if found then
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
  end if;

  update public.roster_claims
    set status = 'approved', decided_at = now(), decided_by = uid
    where id = cl.id;

  update public.roster_claims
    set status = 'rejected', decided_at = now(), decided_by = uid
    where member_id = cl.member_id and status = 'pending' and id <> cl.id;
end;
$$;

-- link_roster_entry: same dual-mode shortcut for coach-driven manual links.
create or replace function public.link_roster_entry(
  p_member_id uuid,
  p_user_id uuid,
  p_as_manager boolean default true
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

  if p_as_manager then
    -- Manager doesn't need to be a playbook member yet (a coach can
    -- pre-link a parent before the parent has joined). If they are
    -- a member, no merging is needed.
    update public.playbook_members
      set managed_by = p_user_id
      where id = p_member_id;
  else
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
  end if;

  insert into public.roster_claims (
    member_id, user_id, status, as_manager, decided_at, decided_by
  ) values (
    p_member_id, p_user_id, 'approved', p_as_manager, now(), uid
  );
end;
$$;

-- unlink_roster_entry needs to clear managed_by too.
create or replace function public.unlink_roster_entry(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m record;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  select * into m from public.playbook_members where id = p_member_id for update;
  if not found then raise exception 'roster_entry_not_found' using errcode = 'P0004'; end if;
  if not public.can_edit_playbook(m.playbook_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;

  -- If the slot was held as a player (user_id set) recreate that user's
  -- access row so they aren't stranded. Then clear all linkage.
  if m.user_id is not null then
    insert into public.playbook_members (playbook_id, user_id, role, status)
    values (m.playbook_id, m.user_id, m.role, m.status)
    on conflict do nothing;

    insert into public.roster_claims (member_id, user_id, status, decided_at, decided_by)
    values (p_member_id, m.user_id, 'revoked', now(), uid);
  end if;

  if m.managed_by is not null and m.user_id is null then
    insert into public.roster_claims (member_id, user_id, status, decided_at, decided_by)
    values (p_member_id, m.managed_by, 'revoked', now(), uid);
  end if;

  update public.playbook_members
    set user_id = null,
        managed_by = null,
        role = 'viewer',
        status = 'active',
        is_head_coach = false,
        coach_title = null,
        coach_upgrade_requested_at = null
    where id = p_member_id;
end;
$$;

-- Backfill: every previously-merged row (label not null AND user_id
-- not null) is split into (a) a fresh access row for that user and
-- (b) the slot, which keeps the label/jersey/positions but loses
-- user_id and gains managed_by. This restores Elijah-as-coach +
-- Asher-as-player on existing data without losing access for any
-- parent who previously claimed via the old merge path.
do $$
declare
  r record;
begin
  for r in
    select id, playbook_id, user_id, role, status, is_head_coach,
           coach_title, coach_upgrade_requested_at
    from public.playbook_members
    where label is not null and user_id is not null
    for update
  loop
    -- Free the (playbook, user) unique slot before recreating access.
    update public.playbook_members
      set user_id = null,
          managed_by = r.user_id,
          role = 'viewer',
          status = 'active',
          is_head_coach = false,
          coach_title = null,
          coach_upgrade_requested_at = null
      where id = r.id;

    insert into public.playbook_members (
      playbook_id, user_id, role, status,
      is_head_coach, coach_title, coach_upgrade_requested_at
    ) values (
      r.playbook_id, r.user_id, r.role, r.status,
      r.is_head_coach, r.coach_title, r.coach_upgrade_requested_at
    )
    on conflict do nothing;
  end loop;
end $$;

grant execute on function public.submit_roster_claim(uuid, text, boolean) to authenticated;
grant execute on function public.approve_roster_claim(uuid) to authenticated;
grant execute on function public.link_roster_entry(uuid, uuid, boolean) to authenticated;
grant execute on function public.unlink_roster_entry(uuid) to authenticated;
