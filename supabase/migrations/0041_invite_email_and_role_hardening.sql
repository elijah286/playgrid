-- Launch hardening for playbook invites.
--
-- 1. Enforce that an invite addressed to a specific email can only be
--    redeemed by a signed-in user whose verified email matches. Without
--    this, anyone with the link could redeem an invite meant for someone
--    else. An invite with NULL email stays a generic shareable link.
-- 2. Lock the `role` column to viewer|editor at the DB level. The UI only
--    ever issues those, but the enum still allows `owner`; a client calling
--    the RPC directly could mint an owner invite.

alter table public.playbook_invites
  drop constraint if exists playbook_invites_role_check,
  add constraint playbook_invites_role_check
    check (role in ('viewer', 'editor'));

create or replace function public.accept_invite(p_token text)
returns uuid
as $$
declare
  inv record;
  uid uuid := auth.uid();
  user_email text;
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

  insert into public.playbook_members (playbook_id, user_id, role, status)
  values (inv.playbook_id, uid, inv.role, 'pending')
  on conflict (playbook_id, user_id) do nothing;

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
