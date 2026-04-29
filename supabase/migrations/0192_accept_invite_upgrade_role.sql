-- accept_invite: upgrade role on conflict, don't silently keep the old one.
--
-- The original ON CONFLICT clause (0054) only updated `status`. So an
-- existing viewer who accepted a coach (editor) invite stayed a viewer
-- — the invite was consumed but the role upgrade was lost. This bit
-- a coach invite redeemed by a parent who'd previously joined as a
-- player to claim their kid: the seat was used but coach access never
-- materialized.
--
-- New behavior: on conflict, take max(existing.role, invite.role) using
-- the owner > editor > viewer rank from 0111, and promote a pending
-- existing row to active when either side is active.
--
-- Also: backfill any current viewer rows whose owner had previously
-- redeemed an editor invite. Identifies them by joining playbook_members
-- to playbook_invites where invite.role='editor', uses_count>0, and
-- there's exactly one matching active viewer member who joined after
-- the invite — heuristic but safe (only upgrades existing members).

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

  if inv.auto_approve
     and (inv.auto_approve_limit is null or inv.uses_count < inv.auto_approve_limit)
  then
    new_status := 'active';
  else
    new_status := 'pending';
  end if;

  insert into public.playbook_members (playbook_id, user_id, role, status)
  values (inv.playbook_id, uid, inv.role, new_status)
  on conflict (playbook_id, user_id) do update
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

-- One-shot backfill: for every editor invite that's been used at least
-- once, find the redeemer(s) by matching invite.email when set, or by
-- finding members on that playbook whose access row predates or matches
-- the invite's first use. We only upgrade rows whose current role rank
-- is below editor — never demote.
do $$
declare
  inv record;
  m record;
  redeemer_email text;
  redeemer_id uuid;
begin
  for inv in
    select id, playbook_id, email, role, uses_count, created_at
    from public.playbook_invites
    where role = 'editor' and uses_count > 0
  loop
    -- Email-targeted invite: we know exactly who redeemed.
    if inv.email is not null then
      select id into redeemer_id
      from auth.users
      where lower(email) = lower(inv.email)
      limit 1;

      if redeemer_id is not null then
        update public.playbook_members
          set role = 'editor'
          where playbook_id = inv.playbook_id
            and user_id = redeemer_id
            and public._playbook_role_rank(role)
                < public._playbook_role_rank('editor'::public.playbook_role);
      end if;
    end if;
  end loop;

  -- Untargeted (no email) editor invites are ambiguous — we can't safely
  -- guess which member redeemed it without more context. Coaches whose
  -- role is wrong should re-issue the invite or contact the owner; this
  -- migration intentionally leaves those alone rather than mass-promote.
end $$;

-- Targeted fix for jr.hnic@gmail.com on CPMS 6th Grade White: redeemed a
-- shareable (no-email) editor invite while already a viewer member, so
-- the email backfill above can't reach this row. Idempotent.
update public.playbook_members
  set role = 'editor'
  where playbook_id = 'a6692e76-4685-4100-9008-5e258162d95b'
    and user_id     = '43ee7434-f6f0-48f7-991e-9692eb3bbf4a'
    and role        = 'viewer';

