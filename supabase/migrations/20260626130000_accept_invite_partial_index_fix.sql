-- FIX: players cannot accept ANY playbook invite (42P10 on every accept).
--
-- Migration 0082 changed the (playbook_id, user_id) uniqueness on
-- playbook_members from a TOTAL pkey into a PARTIAL unique index
-- (`where user_id is not null`), so unclaimed roster rows can share a null
-- user_id. It correctly rewrote accept_invite to an explicit upsert because
-- `on conflict (playbook_id, user_id)` can no longer infer a partial index.
--
-- Migrations 0192 (role-upgrade) and 20260618140000 (ban gate) then RE-INTRODUCED
-- the bare `on conflict (playbook_id, user_id) do update` form. Postgres cannot
-- match that conflict target to a PARTIAL unique index without the index
-- predicate, so accept_invite raises, on EVERY call:
--
--   42P10  there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Net effect since 0192 shipped: no one can accept an invite. The coach's
-- players all hit "Could not accept invite: there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" — which reads as a broken
-- product, and was. (Reproduced against the live DB; the codebase already
-- documents this exact partial-index/ON CONFLICT footgun in
-- src/app/actions/invites.ts.)
--
-- Fix: keep the atomic upsert (best concurrency, and the role-rank + ban logic
-- the later migrations intended) but spell out the partial index's predicate in
-- the conflict target so Postgres can infer the arbiter. The inserted row always
-- has a non-null user_id, so the predicate is always satisfied and behaviour is
-- otherwise identical to 20260618140000.
--
-- The predicate `where user_id is not null` is LOAD-BEARING: it must match the
-- `playbook_members_playbook_user_uniq` partial index (0082). Do not strip it.
-- Pinned by src/app/actions/invites.acceptInvite.partialIndex.test.ts.

create or replace function public.accept_invite(p_token text)
returns uuid
as $$
declare
  inv record;
  uid uuid := auth.uid();
  user_email text;
  new_status public.playbook_member_status;
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

  -- Ban gate (Guideline 1.2): a member the owner removed-and-banned cannot
  -- rejoin via an invite link.
  if exists (
    select 1 from public.playbook_bans
    where playbook_id = inv.playbook_id and user_id = uid
  ) then
    raise exception 'banned_from_playbook' using errcode = 'P0011';
  end if;

  if inv.auto_approve
     and (inv.auto_approve_limit is null or inv.uses_count < inv.auto_approve_limit)
  then
    new_status := 'active';
  else
    new_status := 'pending';
  end if;

  insert into public.playbook_members (playbook_id, user_id, role, status)
  values (inv.playbook_id, uid, inv.role, new_status)
  -- `where user_id is not null` matches the partial unique index from 0082 so
  -- Postgres can infer the arbiter. Without it: 42P10 on every accept.
  on conflict (playbook_id, user_id) where user_id is not null do update
    set role = case
        when public._playbook_role_rank(public.playbook_members.role)
             >= public._playbook_role_rank(excluded.role)
        then public.playbook_members.role
        else excluded.role
      end,
      status = case
        when public.playbook_members.status = 'active'
          or excluded.status = 'active'
        then 'active'::public.playbook_member_status
        else excluded.status
      end;

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
