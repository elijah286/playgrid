-- Engagement + virality telemetry for the Site admin → Traffic dashboard.
--
-- Three additions:
--   1. ui_events     — named in-app events (CTA clicks, saves, opens) so we
--                      can build funnels and exit-point analyses.
--   2. share_events  — every time a user generates or fires off a share
--                      (link, copy-link, native sheet). Lets us measure
--                      virality / K-factor and identify top sharers.
--   3. page_views    — dwell_ms, is_exit, share_token columns to support
--                      time-on-page and inbound-share attribution.
--
-- All three are admin-read-only via RLS. Writes happen server-side with the
-- service role, mirroring the existing page_views ingestion path.

create table if not exists public.ui_events (
  id bigserial primary key,
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  path text,
  event_name text not null,
  target text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ui_events_created_at_idx
  on public.ui_events (created_at desc);
create index if not exists ui_events_event_name_idx
  on public.ui_events (event_name);
create index if not exists ui_events_session_idx
  on public.ui_events (session_id);
create index if not exists ui_events_user_idx
  on public.ui_events (user_id);

alter table public.ui_events enable row level security;

drop policy if exists "ui_events admin read" on public.ui_events;
create policy "ui_events admin read"
  on public.ui_events for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create table if not exists public.share_events (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  share_kind text not null,
  resource_id text,
  channel text,
  share_token text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists share_events_created_at_idx
  on public.share_events (created_at desc);
create index if not exists share_events_actor_idx
  on public.share_events (actor_user_id);
create index if not exists share_events_kind_idx
  on public.share_events (share_kind);
create index if not exists share_events_token_idx
  on public.share_events (share_token)
  where share_token is not null;

alter table public.share_events enable row level security;

drop policy if exists "share_events admin read" on public.share_events;
create policy "share_events admin read"
  on public.share_events for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

alter table public.page_views
  add column if not exists dwell_ms integer,
  add column if not exists is_exit boolean not null default false,
  add column if not exists share_token text;

create index if not exists page_views_share_token_idx
  on public.page_views (share_token)
  where share_token is not null;
