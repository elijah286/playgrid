-- Playbook invites + coach approval gate.
--
-- Two changes:
-- 1. `playbook_members.status` (pending | active). Access RLS only counts
--    active rows, so coaches must approve every signup before that person
--    sees plays. Existing rows are backfilled to 'active' so we don't lock
--    anyone out.
-- 2. `playbook_invites` table for shareable links and direct email invites.
--    Tokens carry role + expiration; accepting an invite inserts a pending
--    `playbook_members` row that the coach then approves in the Roster tab.

create type public.playbook_member_status as enum ('pending', 'active');

alter table public.playbook_members
  add column if not exists status public.playbook_member_status not null default 'active';

-- New rows from the invite-accept path land as 'pending' explicitly; existing
-- rows stay 'active' from the default + the explicit set below.
update public.playbook_members set status = 'active' where status is null;

-- Tighten access helpers: only active members count.
create or replace function public.can_view_playbook(pb uuid)
returns boolean as $$
  select
    exists (
      select 1
      from public.playbooks p
      join public.teams t on t.id = p.team_id
      where p.id = pb and public.is_org_owner(t.org_id)
    )
    or exists (
      select 1
      from public.playbook_members m
      where m.playbook_id = pb
        and m.user_id = auth.uid()
        and m.status = 'active'
    );
$$ language sql stable security definer set search_path = public;

create or replace function public.can_edit_playbook(pb uuid)
returns boolean as $$
  select
    exists (
      select 1
      from public.playbooks p
      join public.teams t on t.id = p.team_id
      where p.id = pb and public.is_org_owner(t.org_id)
    )
    or exists (
      select 1
      from public.playbook_members m
      where m.playbook_id = pb
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'editor')
    );
$$ language sql stable security definer set search_path = public;

-- Invites table.
create table public.playbook_invites (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  role public.playbook_role not null default 'viewer',
  token text not null unique,
  email text,
  note text,
  max_uses integer,
  uses_count integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index playbook_invites_playbook_idx on public.playbook_invites (playbook_id);
create index playbook_invites_token_idx on public.playbook_invites (token);

alter table public.playbook_invites enable row level security;

-- Coaches (editors+) on the playbook can manage invites.
create policy invites_select on public.playbook_invites
  for select using (public.can_edit_playbook(playbook_id));

create policy invites_insert on public.playbook_invites
  for insert with check (public.can_edit_playbook(playbook_id) and created_by = auth.uid());

create policy invites_update on public.playbook_invites
  for update using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));

create policy invites_delete on public.playbook_invites
  for delete using (public.can_edit_playbook(playbook_id));

-- Public token validation runs through a security-definer RPC, not direct
-- table access, so the table itself stays locked down.

create or replace function public.invite_preview(p_token text)
returns table (
  invite_id uuid,
  playbook_id uuid,
  playbook_name text,
  role public.playbook_role,
  expires_at timestamptz,
  exhausted boolean,
  revoked boolean,
  expired boolean
)
as $$
  select
    i.id,
    i.playbook_id,
    p.name,
    i.role,
    i.expires_at,
    (i.max_uses is not null and i.uses_count >= i.max_uses) as exhausted,
    (i.revoked_at is not null) as revoked,
    (i.expires_at <= now()) as expired
  from public.playbook_invites i
  join public.playbooks p on p.id = i.playbook_id
  where i.token = p_token
  limit 1;
$$ language sql stable security definer set search_path = public;

-- Accept an invite: validate state, insert/update playbook_members as
-- pending, bump uses_count. Returns the playbook_id on success or null.
create or replace function public.accept_invite(p_token text)
returns uuid
as $$
declare
  inv record;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
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
