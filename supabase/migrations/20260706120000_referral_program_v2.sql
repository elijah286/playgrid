-- Referral program redesign (audit R1–R8): attribution-driven awards, a real
-- reward for each sender type (Stripe balance credit for payers, comp days for
-- free senders), a double-sided recipient trial, and a bounded per-sender cap.
--
-- All additive. No DROP/DELETE. The one data write is setting a bounded default
-- cap on the single live config row (reversible from Site Admin).

-- 1) profiles.referred_by — the canonical "who referred this user" edge.
--    Set exactly once: at signup from ?ref=, or (backfilled) at the user's
--    first copy-link claim / invite acceptance. on delete set null so removing
--    a referrer never cascades away the referred user.
alter table public.profiles
  add column if not exists referred_by uuid references public.profiles (id) on delete set null;

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by)
  where referred_by is not null;

-- 2) referral_awards — widen so both reward kinds and the recipient-side grant
--    are fully recorded (the old table only modelled a sender comp-days grant).
alter table public.referral_awards
  -- How the SENDER was rewarded. 'comp_days' extends a comp_grant (free
  -- senders); 'stripe_credit' posts a negative customer balance transaction
  -- (paying senders — a comp grant would be worthless, they already have the
  -- tier and Stripe keeps billing).
  add column if not exists reward_kind text not null default 'comp_days'
    check (reward_kind in ('comp_days', 'stripe_credit')),
  -- Sender Stripe credit in cents (null for comp_days awards).
  add column if not exists credit_cents integer
    check (credit_cents is null or credit_cents >= 0),
  -- Stripe customer balance transaction id (null for comp_days awards). Lets us
  -- reconcile / reverse a specific credit without guessing.
  add column if not exists stripe_balance_txn_id text,
  -- Recipient-side reward: Team Coach trial days minted to the NEW coach.
  add column if not exists recipient_days_awarded integer not null default 0
    check (recipient_days_awarded >= 0),
  add column if not exists recipient_comp_grant_id uuid
    references public.comp_grants (id) on delete set null;

-- 3) site_settings — new referral knobs (all admin-tunable in Site Settings).
alter table public.site_settings
  -- Recipient-side reward: Team Coach trial days minted to the new coach on a
  -- qualifying referral. 0 disables the recipient side (one-sided program).
  add column if not exists referral_recipient_trial_days integer not null default 14
    check (referral_recipient_trial_days >= 0 and referral_recipient_trial_days <= 3650),
  -- Payer reward: FIXED Stripe credit (cents) for a paying sender. NULL = auto,
  -- meaning one month of the coach monthly price, fetched from Stripe at award
  -- time. Capped at $1000 as a guardrail against fat-finger config.
  add column if not exists referral_payer_credit_cents integer
    check (referral_payer_credit_cents is null or (referral_payer_credit_cents >= 0 and referral_payer_credit_cents <= 100000)),
  -- Lifetime cap on the NUMBER of qualifying referrals a single sender can be
  -- rewarded for. NULL = uncapped. Applies to BOTH reward kinds — the legacy
  -- referral_cap_days only bounded comp days, which stripe-credit awards bypass.
  add column if not exists referral_cap_awards integer
    check (referral_cap_awards is null or (referral_cap_awards >= 1 and referral_cap_awards <= 100000));

-- 4) Ship a bounded default cap on the live config row if none is set (audit
--    R8: never expose an uncapped liability). 24 lifetime awards ≈ two years of
--    monthly credits — generous but bounded. Admin can raise, lower, or clear.
update public.site_settings
  set referral_cap_awards = 24
  where id = 'default' and referral_cap_awards is null;
