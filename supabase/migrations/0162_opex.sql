-- Operational expense tracking for site admin.
-- One catalog row per external service we pay for; one entry row per service per calendar month.
-- Claude and OpenAI can be auto-fetched from provider cost APIs (admin/org keys live on site_settings).
-- Everything else is manual entry.

-- 1) Site settings: admin/org keys for cost APIs (separate from regular API keys).
alter table public.site_settings
  add column if not exists anthropic_admin_api_key text,
  add column if not exists openai_admin_api_key text;

comment on column public.site_settings.anthropic_admin_api_key is
  'Anthropic Admin API key (sk-ant-admin-…). Used to query org-wide cost reports for the Opex dashboard.';
comment on column public.site_settings.openai_admin_api_key is
  'OpenAI organization Admin key (sk-admin-…). Used to query org-wide costs for the Opex dashboard.';

-- 2) Catalog of services
create table if not exists public.opex_services (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  category    text not null default 'other'
                check (category in ('infra','ai','email','domain','payments','dev_accounts','other')),
  website     text,
  notes       text,
  auto_fetch  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.opex_services enable row level security;

drop policy if exists "opex_services admin all" on public.opex_services;
create policy "opex_services admin all"
  on public.opex_services for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 3) Monthly entries (one row per service per period_month)
create table if not exists public.opex_entries (
  id                  uuid primary key default gen_random_uuid(),
  service_id          uuid not null references public.opex_services(id) on delete cascade,
  period_month        date not null, -- always first-of-month, e.g. 2026-04-01
  amount_cents_manual int,
  amount_cents_auto   int,
  auto_fetched_at     timestamptz,
  auto_source         text,
  currency            text not null default 'USD',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (service_id, period_month),
  check (period_month = date_trunc('month', period_month)::date)
);

create index if not exists opex_entries_period_idx on public.opex_entries (period_month);

alter table public.opex_entries enable row level security;

drop policy if exists "opex_entries admin all" on public.opex_entries;
create policy "opex_entries admin all"
  on public.opex_entries for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 4) Seed catalog (idempotent)
insert into public.opex_services (slug, name, category, website, auto_fetch, sort_order) values
  ('claude',                'Anthropic (Claude)',     'ai',           'https://console.anthropic.com',     true,  10),
  ('openai',                'OpenAI',                 'ai',           'https://platform.openai.com',       true,  20),
  ('supabase',              'Supabase',               'infra',        'https://supabase.com/dashboard',    false, 30),
  ('railway',               'Railway',                'infra',        'https://railway.app',               false, 40),
  ('cloudflare',            'Cloudflare',             'infra',        'https://dash.cloudflare.com',       false, 50),
  ('google_maps',           'Google Maps API',        'infra',        'https://console.cloud.google.com',  false, 60),
  ('stripe',                'Stripe (fees)',          'payments',     'https://dashboard.stripe.com',      false, 70),
  ('resend',                'Resend',                 'email',        'https://resend.com',                false, 80),
  ('zoho',                  'Zoho Mail',              'email',        'https://mail.zoho.com',             false, 90),
  ('godaddy',               'GoDaddy',                'domain',       'https://godaddy.com',               false, 100),
  ('apple_developer',       'Apple Developer',        'dev_accounts', 'https://developer.apple.com',       false, 110),
  ('google_play_developer', 'Google Play Developer',  'dev_accounts', 'https://play.google.com/console',   false, 120)
on conflict (slug) do nothing;
