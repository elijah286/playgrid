-- Authoring infrastructure for the public /examples page.
--
-- Model:
--   * One "examples" user account (a normal auth user) owns the example
--     playbooks. The admin decides which user via site_settings.
--   * Admins toggle "example maker mode" in the UI. While in that mode their
--     server actions route through the service-role client and scope queries
--     to the examples user's id so they can list / create / edit example
--     playbooks using the normal editor.
--   * Per-playbook `is_public_example` flag decides what actually appears on
--     the public /examples page. Drafts owned by the examples user but not
--     published stay private.
--
-- Reads on /examples go through the service-role client, so no anon RLS
-- policies are required for public exposure.

alter table public.site_settings
  add column if not exists examples_user_id uuid;

alter table public.playbooks
  add column if not exists is_public_example boolean not null default false;

-- Speeds up the /examples listing query (publicly visible example playbooks).
create index if not exists playbooks_is_public_example_idx
  on public.playbooks (is_public_example)
  where is_public_example = true;

-- Admins get a permanent read/write grant on the examples user's content so
-- the normal editor and playbooks list work transparently while in maker
-- mode. "Example maker mode" is only a UX filter on the client — security
-- is enforced here at the database. The grant is scoped: only admins, and
-- only on playbooks whose owner-role member matches the configured
-- examples_user_id.

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.is_examples_authoring_playbook(pb uuid)
returns boolean as $$
  select exists (
    select 1
    from public.playbook_members m
    join public.site_settings s on s.id = 'default'
    where m.playbook_id = pb
      and m.role = 'owner'
      and s.examples_user_id is not null
      and m.user_id = s.examples_user_id
  );
$$ language sql stable security definer set search_path = public;

-- Playbooks: admins can read + write any playbook owned by the examples user.
create policy playbooks_admin_examples_select on public.playbooks
  for select using (
    public.is_admin() and public.is_examples_authoring_playbook(id)
  );

create policy playbooks_admin_examples_update on public.playbooks
  for update using (
    public.is_admin() and public.is_examples_authoring_playbook(id)
  )
  with check (
    public.is_admin() and public.is_examples_authoring_playbook(id)
  );

create policy playbooks_admin_examples_delete on public.playbooks
  for delete using (
    public.is_admin() and public.is_examples_authoring_playbook(id)
  );

-- Plays: admins can read + write plays belonging to examples-owned playbooks.
create policy plays_admin_examples_select on public.plays
  for select using (
    public.is_admin() and public.is_examples_authoring_playbook(playbook_id)
  );

create policy plays_admin_examples_write on public.plays
  for all using (
    public.is_admin() and public.is_examples_authoring_playbook(playbook_id)
  )
  with check (
    public.is_admin() and public.is_examples_authoring_playbook(playbook_id)
  );

-- Play versions: same, via the parent play's playbook.
create policy play_versions_admin_examples_select on public.play_versions
  for select using (
    public.is_admin() and exists (
      select 1 from public.plays p
      where p.id = play_id
        and public.is_examples_authoring_playbook(p.playbook_id)
    )
  );

create policy play_versions_admin_examples_write on public.play_versions
  for all using (
    public.is_admin() and exists (
      select 1 from public.plays p
      where p.id = play_id
        and public.is_examples_authoring_playbook(p.playbook_id)
    )
  )
  with check (
    public.is_admin() and exists (
      select 1 from public.plays p
      where p.id = play_id
        and public.is_examples_authoring_playbook(p.playbook_id)
    )
  );

-- Playbook members: admins can view + manage memberships on examples-owned
-- playbooks so they can, e.g., see the owner row while listing.
create policy pm_admin_examples_select on public.playbook_members
  for select using (
    public.is_admin() and public.is_examples_authoring_playbook(playbook_id)
  );

create policy pm_admin_examples_all on public.playbook_members
  for all using (
    public.is_admin() and public.is_examples_authoring_playbook(playbook_id)
  )
  with check (
    public.is_admin() and public.is_examples_authoring_playbook(playbook_id)
  );
