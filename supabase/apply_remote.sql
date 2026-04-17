-- file: supabase/migrations/0001_init.sql
-- PlayGrid initial schema
-- Enable extensions
create extension if not exists "pgcrypto";

-- Profiles (1:1 auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sport_variant text not null default 'flag_7v7',
  calling_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete set null,
  name text not null,
  slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plays (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  name text not null default 'Untitled play',
  shorthand text not null default '',
  wristband_code text not null default '',
  mnemonic text not null default '',
  display_abbrev text not null default '',
  formation_name text not null default '',
  concept text not null default '',
  tag text not null default '',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.play_versions (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays (id) on delete cascade,
  schema_version int not null default 1,
  document jsonb not null,
  parent_version_id uuid references public.play_versions (id) on delete set null,
  label text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.plays
  add constraint plays_current_version_fk
  foreign key (current_version_id) references public.play_versions (id) on delete set null;

create table public.formations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  is_system boolean not null default false,
  semantic_key text not null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.print_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('wristband', 'full_sheet')),
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  resource_type text not null check (resource_type in ('play_version', 'playbook')),
  resource_id uuid not null,
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  play_version_id uuid not null references public.play_versions (id) on delete cascade,
  template_id uuid references public.print_templates (id) on delete set null,
  pdf_storage_path text,
  created_at timestamptz not null default now()
);

create index play_versions_play_id_idx on public.play_versions (play_id);
create index plays_playbook_id_idx on public.plays (playbook_id);
create index playbooks_team_id_idx on public.playbooks (team_id);

-- Updated_at touch
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger playbooks_updated_at
  before update on public.playbooks
  for each row execute function public.set_updated_at();

create trigger plays_updated_at
  before update on public.plays
  for each row execute function public.set_updated_at();

-- Profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.teams enable row level security;
alter table public.seasons enable row level security;
alter table public.playbooks enable row level security;
alter table public.plays enable row level security;
alter table public.play_versions enable row level security;
alter table public.formations enable row level security;
alter table public.print_templates enable row level security;
alter table public.share_links enable row level security;
alter table public.exports enable row level security;

-- Helper: org owned by user
create or replace function public.is_org_owner(org uuid)
returns boolean as $$
  select exists (
    select 1 from public.organizations o
    where o.id = org and o.owner_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

-- Profiles: self only
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- Organizations
create policy org_select on public.organizations
  for select using (owner_id = auth.uid());
create policy org_insert on public.organizations
  for insert with check (owner_id = auth.uid());
create policy org_update on public.organizations
  for update using (owner_id = auth.uid());
create policy org_delete on public.organizations
  for delete using (owner_id = auth.uid());

-- Teams
create policy teams_all on public.teams
  for all using (public.is_org_owner(org_id))
  with check (public.is_org_owner(org_id));

-- Seasons
create policy seasons_all on public.seasons
  for all using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

-- Playbooks
create policy playbooks_all on public.playbooks
  for all using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

-- Plays
create policy plays_all on public.plays
  for all using (
    exists (
      select 1
      from public.playbooks pb
      join public.teams t on t.id = pb.team_id
      where pb.id = playbook_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    exists (
      select 1
      from public.playbooks pb
      join public.teams t on t.id = pb.team_id
      where pb.id = playbook_id and public.is_org_owner(t.org_id)
    )
  );

-- Play versions
create policy play_versions_all on public.play_versions
  for all using (
    exists (
      select 1
      from public.plays p
      join public.playbooks pb on pb.id = p.playbook_id
      join public.teams t on t.id = pb.team_id
      where p.id = play_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    exists (
      select 1
      from public.plays p
      join public.playbooks pb on pb.id = p.playbook_id
      join public.teams t on t.id = pb.team_id
      where p.id = play_id and public.is_org_owner(t.org_id)
    )
  );

-- Formations: read system + own team; write team only
create policy formations_select on public.formations
  for select using (
    is_system = true
    or team_id is null
    or exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

create policy formations_insert on public.formations
  for insert with check (
    is_system = false
    and team_id is not null
    and exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

create policy formations_update on public.formations
  for update using (
    team_id is not null
    and exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

create policy formations_delete on public.formations
  for delete using (
    team_id is not null
    and exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

-- Print templates
create policy print_templates_all on public.print_templates
  for all using (
    team_id is null
    or exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    team_id is null
    or exists (
      select 1 from public.teams t
      where t.id = team_id and public.is_org_owner(t.org_id)
    )
  );

-- Share links: owner CRUD; optional anon read could be added with token
create policy share_links_owner on public.share_links
  for all using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy share_links_public_read on public.share_links
  for select using (true);

-- Exports
create policy exports_all on public.exports
  for all using (
    exists (
      select 1
      from public.play_versions pv
      join public.plays p on p.id = pv.play_id
      join public.playbooks pb on pb.id = p.playbook_id
      join public.teams t on t.id = pb.team_id
      where pv.id = play_version_id and public.is_org_owner(t.org_id)
    )
  )
  with check (
    exists (
      select 1
      from public.play_versions pv
      join public.plays p on p.id = pv.play_id
      join public.playbooks pb on pb.id = p.playbook_id
      join public.teams t on t.id = pb.team_id
      where pv.id = play_version_id and public.is_org_owner(t.org_id)
    )
  );

-- Seed system formations
insert into public.formations (is_system, semantic_key, params)
values
  (true, 'trips_right', '{"strength":"right"}'::jsonb),
  (true, 'doubles', '{}'::jsonb),
  (true, 'bunch', '{}'::jsonb),
  (true, 'empty', '{}'::jsonb),
  (true, '2x2', '{}'::jsonb),
  (true, '3x1', '{"strength":"left"}'::jsonb);

-- file: supabase/migrations/0002_share_play_version_read.sql
-- Allow anyone to read a play version referenced by an active share link (public view by token)
create policy play_versions_public_share_read on public.play_versions
  for select using (
    exists (
      select 1 from public.share_links sl
      where sl.resource_type = 'play_version'
        and sl.resource_id = play_versions.id
        and (sl.expires_at is null or sl.expires_at > now())
    )
  );

-- file: supabase/migrations/0003_admin_roles.sql
-- Site admin role on profiles + RLS for admins to manage users (metadata; auth users managed via Admin API)

alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin'));

create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.is_site_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

-- Replace profile policies so admins can read/update all profiles (for user management)
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_site_admin());

create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_site_admin());

-- file: supabase/migrations/0004_team_theme_playbook_roster.sql
-- Team color palette (JSON) and per-playbook staff/player roster for covers and organization

alter table public.teams
  add column if not exists theme jsonb not null default '{
    "presetId": "default",
    "primary": "#134e2a",
    "accent": "#c2410c",
    "field": "#c8ecd4",
    "ink": "#07140f",
    "surface": "#dfeae2",
    "pageBg": "#fafafa"
  }'::jsonb;

alter table public.playbooks
  add column if not exists roster jsonb not null default '{"staff":[],"players":[]}'::jsonb;

comment on column public.teams.theme is 'Brand palette for PDF covers and print tinting.';
comment on column public.playbooks.roster is 'Named staff and players for this playbook (cover sheet).';

-- file: supabase/migrations/0005_site_settings_openai.sql
-- Singleton site configuration (OpenAI API key, etc.). Access only via service role — RLS on with no policies.

create table if not exists public.site_settings (
  id text primary key,
  openai_api_key text,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, openai_api_key)
values ('default', null)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

