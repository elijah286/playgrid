-- "Send a copy" links — distinct from collaboration invites.
--
-- An invite (playbook_invites) adds the recipient as a member of YOUR
-- playbook. A copy link (playbook_copy_links) gives the recipient a
-- standalone, owned duplicate of the playbook in their own workspace.
-- The two flows share zero state once redeemed: the recipient can edit
-- freely, the sender can keep working on theirs, neither sees the
-- other's changes. Built to drive viral onboarding — peer coaches /
-- prospects can claim a starter playbook without first paying.
--
-- Sender must be Coach+ (matches existing share gating). Recipient is
-- free to claim, but the new owned playbook still counts against their
-- free-tier playbook quota — so claiming a second copy hits the
-- upgrade prompt at the right moment.

create table public.playbook_copy_links (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  token text not null unique,
  max_uses integer,
  uses_count integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  copy_game_results boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index playbook_copy_links_playbook_idx on public.playbook_copy_links (playbook_id);
create index playbook_copy_links_token_idx on public.playbook_copy_links (token);

alter table public.playbook_copy_links enable row level security;

-- Editors+ on the source playbook can manage copy links.
create policy copy_links_select on public.playbook_copy_links
  for select using (public.can_edit_playbook(playbook_id));

create policy copy_links_insert on public.playbook_copy_links
  for insert with check (
    public.can_edit_playbook(playbook_id) and created_by = auth.uid()
  );

create policy copy_links_update on public.playbook_copy_links
  for update using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));

create policy copy_links_delete on public.playbook_copy_links
  for delete using (public.can_edit_playbook(playbook_id));

-- Owner-controlled toggle: disable to stop new copy links from being
-- redeemable. Existing copies are unaffected (they're already owned by
-- the recipients). Default true — the whole feature is opt-in via the
-- explicit "Send a copy" CTA, so a stricter default would just confuse.
alter table public.playbooks
  add column if not exists allow_copy_links boolean not null default true;

-- Public preview RPC. Mirrors invite_preview shape so the landing page
-- can render the same hero card before the recipient signs in. Token
-- access only — table itself stays locked down.
create or replace function public.copy_link_preview(p_token text)
returns table (
  link_id uuid,
  playbook_id uuid,
  playbook_name text,
  team_name text,
  season text,
  sport_variant text,
  logo_url text,
  color text,
  play_count integer,
  head_coach_name text,
  expires_at timestamptz,
  exhausted boolean,
  revoked boolean,
  expired boolean,
  disabled boolean
)
as $$
  select
    cl.id,
    cl.playbook_id,
    p.name,
    t.name as team_name,
    p.season,
    p.sport_variant::text,
    p.logo_url,
    p.color,
    (select count(*)::int from public.plays pl
       where pl.playbook_id = p.id
         and pl.deleted_at is null
         and pl.is_archived is false) as play_count,
    (
      select pr.display_name
      from public.playbook_members m
      join public.profiles pr on pr.id = m.user_id
      where m.playbook_id = p.id
        and m.role = 'owner'
        and m.status = 'active'
      order by m.created_at asc
      limit 1
    ) as head_coach_name,
    cl.expires_at,
    (cl.max_uses is not null and cl.uses_count >= cl.max_uses) as exhausted,
    (cl.revoked_at is not null) as revoked,
    (cl.expires_at <= now()) as expired,
    (p.allow_copy_links is false) as disabled
  from public.playbook_copy_links cl
  join public.playbooks p on p.id = cl.playbook_id
  join public.teams t on t.id = p.team_id
  where cl.token = p_token
  limit 1;
$$ language sql stable security definer set search_path = public;

grant execute on function public.copy_link_preview(text) to anon, authenticated;

-- Atomic redeem helper. Called by the accept server action AFTER the
-- recipient's owned-copy playbook has been inserted; bumps uses_count
-- and auto-revokes when max_uses is reached. Returns false if the link
-- can no longer be redeemed (lost a race, just got revoked, etc.) so
-- the caller can roll back the copy.
create or replace function public.copy_link_redeem(p_token text)
returns boolean as $$
declare
  v_id uuid;
  v_max integer;
  v_uses integer;
begin
  select id, max_uses, uses_count
    into v_id, v_max, v_uses
  from public.playbook_copy_links
  where token = p_token
    and revoked_at is null
    and expires_at > now()
    and (max_uses is null or uses_count < max_uses)
  for update;

  if v_id is null then
    return false;
  end if;

  update public.playbook_copy_links
    set uses_count = uses_count + 1,
        revoked_at = case
          when max_uses is not null and uses_count + 1 >= max_uses then now()
          else revoked_at
        end
  where id = v_id;

  return true;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.copy_link_redeem(text) to authenticated;
