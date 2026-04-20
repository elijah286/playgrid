-- Per-user playbook access + visual identity (logo/color).
--
-- Access model: a user's capabilities are scoped per-playbook, not per-profile.
-- Anyone can create a playbook; sharing grants another user a role on that
-- specific playbook. Existing org-owner access is preserved as a fallback so
-- this migration doesn't break current sessions.

create type public.playbook_role as enum ('owner', 'editor', 'viewer');

create table public.playbook_members (
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.playbook_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (playbook_id, user_id)
);

create index playbook_members_user_idx on public.playbook_members (user_id);

-- Visual identity: emoji/icon/image URL + hex color.
alter table public.playbooks
  add column if not exists logo_url text,
  add column if not exists color text;

-- Helper functions used by RLS. security definer is safe here — they only read
-- the caller's own auth.uid() against membership rows.

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
      where m.playbook_id = pb and m.user_id = auth.uid()
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
      where m.playbook_id = pb and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    );
$$ language sql stable security definer set search_path = public;

-- Backfill memberships: every existing playbook gets its org owner as 'owner'.
insert into public.playbook_members (playbook_id, user_id, role)
select pb.id, o.owner_id, 'owner'::public.playbook_role
from public.playbooks pb
join public.teams t on t.id = pb.team_id
join public.organizations o on o.id = t.org_id
on conflict do nothing;

-- RLS on the membership table itself.
alter table public.playbook_members enable row level security;

-- Any user can see their own membership rows. Editors/owners can see all
-- memberships on playbooks they can edit (for the sharing UI).
create policy pm_select_self on public.playbook_members
  for select using (user_id = auth.uid() or public.can_edit_playbook(playbook_id));

create policy pm_insert on public.playbook_members
  for insert with check (public.can_edit_playbook(playbook_id));

create policy pm_update on public.playbook_members
  for update using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));

-- Owners/editors can remove; a user can always remove themselves.
create policy pm_delete on public.playbook_members
  for delete using (
    user_id = auth.uid() or public.can_edit_playbook(playbook_id)
  );

-- Widen existing table policies by adding additive membership-based access.
-- We don't drop the legacy org-owner policies; these new policies are OR'd in.

create policy playbooks_member_select on public.playbooks
  for select using (public.can_view_playbook(id));

create policy playbooks_member_update on public.playbooks
  for update using (public.can_edit_playbook(id))
  with check (public.can_edit_playbook(id));

create policy plays_member_select on public.plays
  for select using (public.can_view_playbook(playbook_id));

create policy plays_member_write on public.plays
  for all using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));

create policy play_versions_member_select on public.play_versions
  for select using (
    exists (
      select 1 from public.plays p
      where p.id = play_id and public.can_view_playbook(p.playbook_id)
    )
  );

create policy play_versions_member_write on public.play_versions
  for all using (
    exists (
      select 1 from public.plays p
      where p.id = play_id and public.can_edit_playbook(p.playbook_id)
    )
  )
  with check (
    exists (
      select 1 from public.plays p
      where p.id = play_id and public.can_edit_playbook(p.playbook_id)
    )
  );
