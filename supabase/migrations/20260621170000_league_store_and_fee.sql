-- Registration fee + store catalog (Track B — registration/commerce config).
--
-- Additive + gated. Adds a fee to the league registration window and a
-- store-items catalog the operator configures (offered to parents at
-- registration). League-scoped RLS; no existing table's behavior changes.

alter table public.registration_windows
  add column if not exists fee_cents integer not null default 0;

create table public.league_store_items (
  id          uuid        primary key default gen_random_uuid(),
  league_id   uuid        not null references public.leagues(id) on delete cascade,
  name        text        not null,
  description text,
  price_cents integer     not null default 0,
  required    boolean     not null default false,
  active      boolean     not null default true,
  -- Variant options as data (e.g. {"sizes":["YS","YM","YL","AS"]}), so the
  -- catalog stays sport-agnostic.
  options     jsonb       not null default '{}'::jsonb,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index league_store_items_league_idx on public.league_store_items (league_id) where active;

drop trigger if exists league_store_items_set_updated_at on public.league_store_items;
create trigger league_store_items_set_updated_at
  before update on public.league_store_items
  for each row execute function public.set_updated_at();

alter table public.league_store_items enable row level security;

create policy league_store_items_select_member on public.league_store_items
  for select using (public.is_league_member(league_id) or public.is_site_admin());

create policy league_store_items_write_admin on public.league_store_items
  for all using (public.is_league_admin(league_id) or public.is_site_admin())
  with check (public.is_league_admin(league_id) or public.is_site_admin());
