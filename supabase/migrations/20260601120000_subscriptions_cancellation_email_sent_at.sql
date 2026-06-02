-- Cancellation-feedback email idempotency column.
--
-- When a subscription transitions to cancel_at_period_end = true (or
-- status = "canceled" without a prior pending cancel), the Stripe webhook
-- fires an email confirming the cancellation and asking for one-line
-- feedback (admin@xogridmaker.com → replies route back to the founder).
-- Stripe retries webhooks and can fire the same `customer.subscription.updated`
-- event more than once; this column lets the handler claim the send
-- exactly once via an UPDATE-with-guard, so retries are no-ops.

alter table public.subscriptions
  add column if not exists cancellation_feedback_email_sent_at timestamptz;

-- Partial index supports the eligibility check cheaply once the table
-- grows: "subscriptions that have a pending cancellation and haven't
-- received the feedback email yet."
create index if not exists subscriptions_cancellation_feedback_pending_idx
  on public.subscriptions (stripe_subscription_id)
  where cancellation_feedback_email_sent_at is null
    and cancel_at_period_end = true;
