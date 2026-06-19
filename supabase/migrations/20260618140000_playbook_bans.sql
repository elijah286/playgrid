-- Owner "remove + ban" for playbook members (App Store Guideline 1.2: ability
-- to block abusive users). A playbook owner/editor can remove a member AND bar
-- them from rejoining via any invite link. Mirrors the approve_roster_claim
-- security-definer pattern (0082): permission checked with can_edit_playbook().

create table public.playbook_bans (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by uuid references auth.users(id) on delete set null,
  banned_at timestamptz not null default now(),
  unique (playbook_id, user_id)
);

create index playbook_bans_playbook_idx on public.playbook_bans (playbook_id);

alter table public.playbook_bans enable row level security;

-- Editors/owners of the playbook can see and lift (delete) its bans. Inserts go
-- only through the security-definer RPC below (it also deletes the membership).
create policy "editors read playbook bans"
  on public.playbook_bans for select
  using (public.can_edit_playbook(playbook_id));

create policy "no direct ban insert"
  on public.playbook_bans for insert with check (false);

create policy "no direct ban update"
  on public.playbook_bans for update using (false);

create policy "editors lift playbook bans"
  on public.playbook_bans for delete
  using (public.can_edit_playbook(playbook_id));

-- Remove a member and ban them from the playbook. Editor-gated; refuses to ban
-- the caller or an owner.
create or replace function public.remove_and_ban_member(
  p_playbook_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role public.playbook_role;
begin
  if not public.can_edit_playbook(p_playbook_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_ban_self' using errcode = 'P0001';
  end if;

  select role into target_role
  from public.playbook_members
  where playbook_id = p_playbook_id and user_id = p_user_id;

  if target_role = 'owner' then
    raise exception 'cannot_ban_owner' using errcode = 'P0001';
  end if;

  delete from public.playbook_members
  where playbook_id = p_playbook_id and user_id = p_user_id;

  insert into public.playbook_bans (playbook_id, user_id, banned_by)
  values (p_playbook_id, p_user_id, auth.uid())
  on conflict (playbook_id, user_id) do nothing;
end;
$$;

grant execute on function public.remove_and_ban_member(uuid, uuid) to authenticated;

-- Re-create accept_invite (authoritative body from 0192) with a ban check added
-- so a banned user can't rejoin via any invite link. Only the ban guard is new;
-- the 0192 one-shot backfills are intentionally NOT repeated.
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
