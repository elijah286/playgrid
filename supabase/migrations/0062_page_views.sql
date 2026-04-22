-- Anonymous + authed page-view telemetry for the admin Traffic tab.
-- Rows are written server-side via service-role (no client insert path);
-- RLS exposes reads only to admins.

create table if not exists public.page_views (
  id bigserial primary key,
  session_id text not null,
  path text not null,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  country text,
  region text,
  city text,
  user_agent text,
  device text check (device in ('mobile','tablet','desktop')),
  user_id uuid references auth.users(id) on delete set null,
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx
  on public.page_views (created_at desc);
create index if not exists page_views_session_idx
  on public.page_views (session_id);
create index if not exists page_views_user_idx
  on public.page_views (user_id);
create index if not exists page_views_path_idx
  on public.page_views (path);

alter table public.page_views enable row level security;

drop policy if exists "page_views admin read" on public.page_views;
create policy "page_views admin read"
  on public.page_views for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
