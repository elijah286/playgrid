-- Shareable invites default to auto-join (coach-approval-free). Two new
-- columns on `playbook_invites` drive the behavior of `accept_invite`:
--
--   auto_approve         when true, redemptions land as 'active' members
--                        (no approval needed). When false, they land as
--                        'pending' — the existing gate.
--   auto_approve_limit   optional cap on how many unique users may
--                        auto-approve. Once uses_count reaches the limit,
--                        further redemptions fall back to 'pending'
--                        regardless of `auto_approve`.
--
-- Existing rows are backfilled to auto_approve=false so in-flight links
-- keep their current approval gate. New rows default to true so the
-- "share and forget" UX the UI exposes works out of the box.

alter table public.playbook_invites
  add column if not exists auto_approve boolean not null default true,
  add column if not exists auto_approve_limit integer;

update public.playbook_invites
  set auto_approve = false
  where created_at < now();

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
    set status = case
      when public.playbook_members.status = 'active' then public.playbook_members.status
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
