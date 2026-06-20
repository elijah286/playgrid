-- League people, guardianship, minor consent, and audit log (Wave 0).
--
-- COPPA foundation: minors are linked to guardians and gated by auditable consent
-- from day one (not retrofitted). PII tables are scoped to league ADMINS of the
-- relevant league plus the guardian/player themselves — deliberately NOT blanket
-- site-admin, to minimize minors'-PII exposure.

create type public.consent_kind as enum (
  'participation', 'medical', 'liability_waiver', 'media_release', 'data_processing'
);

-- ── Player profiles (a participant; may or may not have a platform login) ─────
create table public.player_profiles (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        not null references public.leagues(id) on delete cascade,
  user_id     uuid        references public.profiles(id) on delete set null,
  first_name  text        not null,
  last_name   text        not null,
  birthdate   date,
  is_minor    boolean     not null default true,
  attributes  jsonb       not null default '{}'::jsonb,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index player_profiles_league_idx
  on public.player_profiles (league_id) where archived_at is null;
create index player_profiles_user_idx on public.player_profiles (user_id);

drop trigger if exists player_profiles_set_updated_at on public.player_profiles;
create trigger player_profiles_set_updated_at
  before update on public.player_profiles
  for each row execute function public.set_updated_at();

-- ── Parent / guardian ────────────────────────────────────────────────────────
create table public.parent_guardians (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        not null references public.leagues(id) on delete cascade,
  user_id     uuid        references public.profiles(id) on delete set null,
  full_name   text        not null,
  email       text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index parent_guardians_league_idx on public.parent_guardians (league_id);
create index parent_guardians_user_idx on public.parent_guardians (user_id);

drop trigger if exists parent_guardians_set_updated_at on public.parent_guardians;
create trigger parent_guardians_set_updated_at
  before update on public.parent_guardians
  for each row execute function public.set_updated_at();

-- ── Guardian ↔ player link ───────────────────────────────────────────────────
create table public.guardian_links (
  id           uuid        primary key default gen_random_uuid(),
  guardian_id  uuid        not null references public.parent_guardians(id) on delete cascade,
  player_id    uuid        not null references public.player_profiles(id) on delete cascade,
  relationship text,
  is_primary   boolean     not null default false,
  created_at   timestamptz not null default now(),
  unique (guardian_id, player_id)
);

create index guardian_links_player_idx on public.guardian_links (player_id);

-- ── Minor consent records (auditable; required before roster approval in Track A)
create table public.minor_consent_records (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        not null references public.leagues(id) on delete cascade,
  player_id   uuid        not null references public.player_profiles(id) on delete cascade,
  guardian_id uuid        references public.parent_guardians(id) on delete set null,
  kind        public.consent_kind not null,
  granted     boolean     not null default false,
  granted_at  timestamptz,
  -- Audit of how/where consent was captured.
  signed_name text,
  signed_ip   text,
  document_url text,
  created_at  timestamptz not null default now()
);

create index minor_consent_player_idx on public.minor_consent_records (player_id);
create index minor_consent_league_idx on public.minor_consent_records (league_id);

-- ── Audit log (shared infra for every consequential league mutation) ─────────
create table public.league_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        references public.leagues(id) on delete set null,
  actor_id    uuid        references auth.users(id) on delete set null,
  action      text        not null,
  entity_type text,
  entity_id   uuid,
  detail      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index league_audit_league_idx on public.league_audit_log (league_id, created_at desc);

-- Security-definer writer: app code appends audit rows without a broad insert grant.
create or replace function public.log_league_audit(
  p_league uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_detail jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.league_audit_log (league_id, actor_id, action, entity_type, entity_id, detail)
  values (p_league, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- ── RLS: PII is league-admin scoped (NOT blanket site-admin) ─────────────────
alter table public.player_profiles enable row level security;

create policy player_profiles_select on public.player_profiles
  for select using (
    public.is_league_admin(league_id)
    or user_id = auth.uid()
    or exists (
      select 1 from public.guardian_links gl
      join public.parent_guardians g on g.id = gl.guardian_id
      where gl.player_id = player_profiles.id and g.user_id = auth.uid()
    )
  );

create policy player_profiles_write on public.player_profiles
  for all using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

alter table public.parent_guardians enable row level security;

create policy parent_guardians_select on public.parent_guardians
  for select using (public.is_league_admin(league_id) or user_id = auth.uid());

create policy parent_guardians_write on public.parent_guardians
  for all using (public.is_league_admin(league_id) or user_id = auth.uid())
  with check (public.is_league_admin(league_id) or user_id = auth.uid());

alter table public.guardian_links enable row level security;

create policy guardian_links_select on public.guardian_links
  for select using (
    exists (
      select 1 from public.player_profiles p
      where p.id = guardian_links.player_id and public.is_league_admin(p.league_id)
    )
    or exists (
      select 1 from public.parent_guardians g
      where g.id = guardian_links.guardian_id and g.user_id = auth.uid()
    )
  );

create policy guardian_links_write on public.guardian_links
  for all using (
    exists (
      select 1 from public.player_profiles p
      where p.id = guardian_links.player_id and public.is_league_admin(p.league_id)
    )
  )
  with check (
    exists (
      select 1 from public.player_profiles p
      where p.id = guardian_links.player_id and public.is_league_admin(p.league_id)
    )
  );

alter table public.minor_consent_records enable row level security;

create policy minor_consent_select on public.minor_consent_records
  for select using (
    public.is_league_admin(league_id)
    or exists (
      select 1 from public.parent_guardians g
      where g.id = minor_consent_records.guardian_id and g.user_id = auth.uid()
    )
  );

create policy minor_consent_write on public.minor_consent_records
  for all using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

alter table public.league_audit_log enable row level security;

-- Read by league admins (their league) or site admins; writes go through
-- log_league_audit() (security definer), so there is no direct insert policy.
create policy league_audit_select on public.league_audit_log
  for select using (public.is_league_admin(league_id) or public.is_site_admin());
