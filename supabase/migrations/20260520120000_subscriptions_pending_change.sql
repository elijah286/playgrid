-- Track end-of-period tier changes (Phase 2 downgrade flow).
--
-- When a coach downgrades coach_ai → coach we don't change the price
-- immediately — Stripe creates a subscription_schedule with two phases
-- (current tier until current_period_end, then target tier). The
-- subscription row keeps the current tier (because the user still has
-- those entitlements until period end), but we need to surface "switching
-- to X on Y" in the UI and let them cancel the pending change.
--
-- These columns store that pending-change state, synced from Stripe via
-- subscription_schedule.* webhook events.
--
-- Additive + nullable. NULL means "no pending change" — the normal state.

alter table public.subscriptions
  add column if not exists pending_change_tier public.subscription_tier,
  add column if not exists pending_change_effective_at timestamptz,
  add column if not exists pending_change_schedule_id text;

comment on column public.subscriptions.pending_change_tier is
  'When non-null, the subscription is scheduled to switch to this tier at '
  'pending_change_effective_at via a Stripe subscription_schedule. NULL = '
  'no pending change. The schedule id is stored in pending_change_schedule_id '
  'so we can release it when the user cancels.';

comment on column public.subscriptions.pending_change_effective_at is
  'When the scheduled tier change takes effect. Typically equals the '
  'current_period_end at the time of scheduling.';

comment on column public.subscriptions.pending_change_schedule_id is
  'Stripe subscription_schedule id backing the pending change. Used to '
  'release the schedule when the user cancels the pending downgrade.';

create index if not exists subscriptions_pending_change_idx
  on public.subscriptions (user_id)
  where pending_change_tier is not null;
