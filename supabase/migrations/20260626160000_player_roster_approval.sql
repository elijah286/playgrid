-- 2026-06-26: Roster = the people who joined.
--
-- Model: accepting an invite puts you ON the roster automatically — your
-- name and the position you picked at accept. No separate "add yourself"
-- step. By default you're confirmed (status='active') the moment you join.
--
-- A coach who wants to vet new members sets a persistent per-playbook flag
-- `roster_approval_required`. With it on, every joiner lands TENTATIVE
-- (status='pending') and shows as "waiting on coach approval" on the
-- roster until the coach confirms them — the existing approve/deny member
-- flow. Off (default) keeps today's behavior: joiners are confirmed.
--
-- Centralizing the decision in accept_invite (rather than at each invite-
-- creation path) means the playbook flag governs every link uniformly, and
-- a coach can flip it without reissuing invites.

-- 1. The flag. Default false so existing playbooks are unchanged (joiners
--    stay auto-confirmed exactly as before this migration).
alter table public.playbooks
  add column if not exists roster_approval_required boolean not null default false;

comment on column public.playbooks.roster_approval_required is
  'When true, new members who accept an invite land tentative (status=pending) until the coach approves them on the roster. Default false = auto-confirmed. See migration 20260626160000.';

-- 2. accept_invite honors the flag. Rebased on the current definition
--    (20260626130000_accept_invite_partial_index_fix) — only the status
--    decision changes; ban gate, the partial-index on-conflict upsert, and
--    the uses_count bump are preserved verbatim.
create or replace function public.accept_invite(p_token text)
returns uuid
as $$
declare
  inv record;
  uid uuid := auth.uid();
  user_email text;
  new_status public.playbook_member_status;
  approval_required boolean;
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

  -- Status decision: a coach who requires approval makes every joiner
  -- tentative regardless of the invite's auto_approve. Otherwise honor the
  -- invite's auto_approve (+ its optional per-link limit).
  select roster_approval_required into approval_required
  from public.playbooks where id = inv.playbook_id;

  if coalesce(approval_required, false) then
    new_status := 'pending';
  elsif inv.auto_approve
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
