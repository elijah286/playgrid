-- Stripe Connect for league registration payments (Track B, slice D).
--
-- Additive + gated. Stores the operator's connected Stripe account on the league,
-- payment references on the registration, and the platform fee (basis points) as
-- a site setting. No existing behavior changes until the payment code ships.

alter table public.leagues
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false;

alter table public.player_registrations
  add column if not exists stripe_session_id text,
  add column if not exists paid_at timestamptz;

-- Platform application fee in basis points (500 = 5%). Site-admin configurable.
alter table public.site_settings
  add column if not exists league_platform_fee_bps integer not null default 0;
