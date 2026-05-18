-- Add cancel_at to public.subscriptions. Stripe supports two cancellation
-- paths and we were only tracking one:
--   1. cancel_at_period_end (boolean) — cancel at end of current period
--      (already tracked in 0055_billing.sql)
--   2. cancel_at (timestamp) — cancel at a specific future date
--
-- Without this column, Stripe's `subscription.cancel_at` was silently dropped:
-- admin churn queries miss the affected accounts, the user-facing "your plan
-- ends on X" banner shows the wrong date (or doesn't fire at all), and any
-- retention/winback automation skips them.
--
-- Additive, nullable — no backfill needed in this migration; a one-shot
-- script (scripts/backfill-subscription-cancel-at.ts) reconciles existing
-- rows against Stripe after this lands.

alter table public.subscriptions
  add column if not exists cancel_at timestamptz;

comment on column public.subscriptions.cancel_at is
  'When set, the subscription is scheduled to cancel at this exact timestamp '
  '(Stripe.Subscription.cancel_at). Independent of cancel_at_period_end: '
  'Stripe-portal cancellations populate both (with cancel_at = period_end), '
  'but API/admin-scheduled cancellations at a custom future date set only '
  'this column. Treat NOT NULL as a pending cancellation.';
