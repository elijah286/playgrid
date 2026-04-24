-- Coach-managed roster + player claim flow.
--
-- Today every playbook_members row represents BOTH a user's access to the
-- playbook AND a roster slot (label/jersey/positions). That collapses to a
-- single table for free, but blocks the case a coach wants now: pre-adding
-- a player to the roster before any user has joined.
--
-- This migration makes user_id nullable so a row can exist as an "unclaimed
-- roster entry" (user_id = null, role = viewer, status = active). A new
-- surrogate primary key `id` lets such rows exist without a user. The
-- unique (playbook_id, user_id) constraint is reinstated as a partial
-- index so a claimed row is still unique per user but unclaimed rows are
-- free to multiply.
--
-- A separate `roster_claims` table records every claim request and
-- decision (approved/rejected/revoked) so coaches can see history and
-- reassign a bad approval without losing context. Only the claim lifecycle
-- lives here; the eventual link is stored as `playbook_members.user_id`.

-- 1. Surrogate PK on playbook_members.

alter table public.playbook_members
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.playbook_members
  drop constraint playbook_members_pkey;

alter table public.playbook_members
  add constraint playbook_members_pkey primary key (id);

-- Uniqueness on (playbook_id, user_id) now only applies when claimed.
create unique index playbook_members_playbook_user_uniq
  on public.playbook_members (playbook_id, user_id)
  where user_id is not null;

-- 2. Allow unclaimed roster entries.

alter table public.playbook_members
  alter column user_id drop not null;

-- Unclaimed rows must be plain player slots. A row without a user can't
-- have a role like owner/editor (those imply a logged-in person), and
-- shouldn't be sitting in 'pending' approval state.
alter table public.playbook_members
  add constraint playbook_members_unclaimed_shape check (
    user_id is not null
    or (role = 'viewer' and status = 'active' and is_head_coach = false)
  );

-- 3. accept_invite rewrite — the `on conflict (playbook_id, user_id)` form
-- relied on a total unique constraint. It's now a partial index, so we
-- do the upsert explicitly.

create or replace function public.accept_invite(p_token text)
returns uuid
as $$
declare
  inv record;
  uid uuid := auth.uid();
  user_email text;
  new_status public.playbook_member_status;
  existing_id uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  select *
  into inv
  from public.playbook_invites
  where token = p_token
  for update;

  if not found then return null; end if;
  if inv.revoked_at is not null then return null; end if;
  if inv.expires_at <= now() then return null; end if;
  if inv.max_uses is not null and inv.uses_count >= inv.max_uses then return null; end if;

  if inv.email is not null then
    select email into user_email from auth.users where id = uid;
    if user_email is null or lower(user_email) <> lower(inv.email) then
      raise exception 'invite_email_mismatch' using errcode = 'P0002';
    end if;
  end if;

  if inv.auto_approve
     and (inv.auto_approve_limit is null or inv.uses_count < inv.auto_approve_limit)
  then
    new_status := 'active';
  else
    new_status := 'pending';
  end if;

  select id into existing_id
  from public.playbook_members
  where playbook_id = inv.playbook_id and user_id = uid;

  if existing_id is not null then
    update public.playbook_members
      set status = case when status = 'active' then status else new_status end
      where id = existing_id;
  else
    insert into public.playbook_members (playbook_id, user_id, role, status)
    values (inv.playbook_id, uid, inv.role, new_status);
  end if;

  update public.playbook_invites
    set uses_count = uses_count + 1,
        revoked_at = case
          when max_uses is not null and uses_count + 1 >= max_uses then now()
          else revoked_at
        end
    where id = inv.id;

  return inv.playbook_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Unclaimed rows need to be visible to pending viewers too, so the
-- claim step can list them. The existing pm_select_self policy only shows
-- rows where user_id = auth.uid() or the caller can edit the playbook.
-- Add an additive policy: any signed-in user who has a membership row
-- (pending or active) on the playbook can see unclaimed roster entries
-- on that playbook.

create policy pm_select_unclaimed on public.playbook_members
  for select using (
    user_id is null
    and exists (
      select 1 from public.playbook_members self
      where self.playbook_id = playbook_members.playbook_id
        and self.user_id = auth.uid()
    )
  );

-- 5. Claims table.

create type public.roster_claim_status as enum (
  'pending', 'approved', 'rejected', 'revoked'
);

create table public.roster_claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.playbook_members (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.roster_claim_status not null default 'pending',
  note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);

create index roster_claims_member_idx on public.roster_claims (member_id);
create index roster_claims_user_idx on public.roster_claims (user_id);

-- At most one pending claim per (member, user). Approving one resolves
-- all other pending claims on the same member (handled in RPC).
create unique index roster_claims_one_pending_per_pair
  on public.roster_claims (member_id, user_id)
  where status = 'pending';

alter table public.roster_claims enable row level security;

create policy rc_select on public.roster_claims
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.playbook_members m
      where m.id = roster_claims.member_id
        and public.can_edit_playbook(m.playbook_id)
    )
  );

-- Direct writes are locked down; the RPCs below (security definer) own
-- the state machine. This keeps decided_at/decided_by/status transitions
-- consistent across collision cases.
create policy rc_no_direct_insert on public.roster_claims
  for insert with check (false);
create policy rc_no_direct_update on public.roster_claims
  for update using (false);
create policy rc_no_direct_delete on public.roster_claims
  for delete using (false);

-- 6. RPCs.

-- Coach: add an unclaimed roster entry. Returns the new member id.
create or replace function public.add_roster_entry(
  p_playbook_id uuid,
  p_label text,
  p_jersey_number text default null,
  p_positions text[] default '{}',
  p_is_minor boolean default false
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
  cleaned text[];
begin
  if not public.can_edit_playbook(p_playbook_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;

  select coalesce(array_agg(distinct trim(p) order by trim(p)), '{}')
    into cleaned
  from unnest(coalesce(p_positions, '{}')) as p
  where trim(p) <> '' and length(trim(p)) <= 12;
  if array_length(cleaned, 1) > 8 then cleaned := cleaned[1:8]; end if;

  insert into public.playbook_members (
    playbook_id, user_id, role, status,
    label, jersey_number, positions, position, is_minor
  ) values (
    p_playbook_id, null, 'viewer', 'active',
    nullif(trim(p_label), ''),
    nullif(trim(coalesce(p_jersey_number, '')), ''),
    cleaned,
    case when array_length(cleaned, 1) >= 1 then cleaned[1] else null end,
    coalesce(p_is_minor, false)
  ) returning id into new_id;

  return new_id;
end;
$$;

-- Player: submit a claim on an unclaimed roster entry. Caller must be a
-- member (pending or active) of the playbook the entry belongs to.
create or replace function public.submit_roster_claim(
  p_member_id uuid,
  p_note text default null
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

  select m.id, m.playbook_id, m.user_id
    into target
  from public.playbook_members m
  where m.id = p_member_id
  for update;

  if not found then raise exception 'roster_entry_not_found' using errcode = 'P0004'; end if;
  if target.user_id is not null then raise exception 'roster_entry_already_claimed' using errcode = 'P0005'; end if;

  -- Caller must already belong to this playbook (pending or active).
  if not exists (
    select 1 from public.playbook_members
    where playbook_id = target.playbook_id and user_id = uid
  ) then
    raise exception 'not_a_member' using errcode = 'P0006';
  end if;

  -- One claim per user per playbook at a time keeps the coach UI simple.
  if exists (
    select 1 from public.roster_claims rc
    join public.playbook_members m on m.id = rc.member_id
    where rc.user_id = uid
      and rc.status = 'pending'
      and m.playbook_id = target.playbook_id
  ) then
    raise exception 'claim_already_pending' using errcode = 'P0007';
  end if;

  insert into public.roster_claims (member_id, user_id, note)
  values (p_member_id, uid, nullif(trim(coalesce(p_note, '')), ''))
  returning id into claim_id;

  return claim_id;
end;
$$;

-- Player: cancel their own pending claim.
create or replace function public.cancel_roster_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;
  update public.roster_claims
    set status = 'revoked', decided_at = now(), decided_by = uid
    where id = p_claim_id and user_id = uid and status = 'pending';
end;
$$;

-- Coach: approve a claim. Sets the member's user_id, resolves competing
-- pending claims on the same member as 'rejected'.
create or replace function public.approve_roster_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  cl record;
  uid uuid := auth.uid();
  member_playbook uuid;
  existing_member_id uuid;
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

  -- The claimer may already have a self-joined row on this playbook
  -- (joined via invite without claiming). Merge: delete their auto-created
  -- row, then link them to the coach-added entry. Everything that points
  -- at playbook_members does so via the non-changing `id` of whichever
  -- row survives, so no cascade rewrites needed.
  select id into existing_member_id
  from public.playbook_members
  where playbook_id = cl.playbook_id and user_id = cl.user_id;

  if existing_member_id is not null and existing_member_id <> cl.member_id then
    delete from public.playbook_members where id = existing_member_id;
  end if;

  update public.playbook_members
    set user_id = cl.user_id
    where id = cl.member_id;

  update public.roster_claims
    set status = 'approved', decided_at = now(), decided_by = uid
    where id = cl.id;

  -- Any other pending claims on this member become rejected.
  update public.roster_claims
    set status = 'rejected', decided_at = now(), decided_by = uid
    where member_id = cl.member_id and status = 'pending' and id <> cl.id;
end;
$$;

-- Coach: reject a single pending claim.
create or replace function public.reject_roster_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  cl record;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  select rc.*, m.playbook_id
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

  update public.roster_claims
    set status = 'rejected', decided_at = now(), decided_by = uid
    where id = cl.id;
end;
$$;

-- Coach: unlink a claimed roster entry. The user keeps their team
-- membership as a new unclaimed-turned-self row (we don't silently yank
-- their access). The roster entry returns to unclaimed status.
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

  select * into m from public.playbook_members
  where id = p_member_id
  for update;

  if not found then raise exception 'roster_entry_not_found' using errcode = 'P0004'; end if;
  if not public.can_edit_playbook(m.playbook_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;
  if m.user_id is null then return; end if;

  -- Recreate the user's own membership row so they aren't stranded.
  insert into public.playbook_members (playbook_id, user_id, role, status)
  values (m.playbook_id, m.user_id, m.role, m.status);

  -- Clear the roster slot.
  update public.playbook_members
    set user_id = null,
        role = 'viewer',
        status = 'active',
        is_head_coach = false,
        coach_title = null,
        coach_upgrade_requested_at = null
    where id = p_member_id;

  -- Log the unlink as a revoked claim row for history.
  insert into public.roster_claims (member_id, user_id, status, decided_at, decided_by)
  values (p_member_id, m.user_id, 'revoked', now(), uid);
end;
$$;

-- Coach: manually link a user (already a member) to an unclaimed roster
-- entry. Shortcut for the merge flow when no claim was submitted.
create or replace function public.link_roster_entry(
  p_member_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  target record;
  uid uuid := auth.uid();
  existing_id uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  select * into target from public.playbook_members
  where id = p_member_id
  for update;

  if not found then raise exception 'roster_entry_not_found' using errcode = 'P0004'; end if;
  if not public.can_edit_playbook(target.playbook_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;
  if target.user_id is not null then
    raise exception 'roster_entry_already_claimed' using errcode = 'P0005';
  end if;

  select id into existing_id
  from public.playbook_members
  where playbook_id = target.playbook_id and user_id = p_user_id;

  if existing_id is null then
    raise exception 'user_not_on_playbook' using errcode = 'P0010';
  end if;

  if existing_id <> p_member_id then
    delete from public.playbook_members where id = existing_id;
  end if;

  update public.playbook_members
    set user_id = p_user_id
    where id = p_member_id;

  insert into public.roster_claims (
    member_id, user_id, status, decided_at, decided_by
  ) values (
    p_member_id, p_user_id, 'approved', now(), uid
  );
end;
$$;

grant execute on function public.add_roster_entry(uuid, text, text, text[], boolean) to authenticated;
grant execute on function public.submit_roster_claim(uuid, text) to authenticated;
grant execute on function public.cancel_roster_claim(uuid) to authenticated;
grant execute on function public.approve_roster_claim(uuid) to authenticated;
grant execute on function public.reject_roster_claim(uuid) to authenticated;
grant execute on function public.unlink_roster_entry(uuid) to authenticated;
grant execute on function public.link_roster_entry(uuid, uuid) to authenticated;
