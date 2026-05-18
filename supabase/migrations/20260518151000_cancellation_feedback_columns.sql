-- Follow-up: the alter-table half of 20260518150000_cancellation_feedback.sql
-- did not land (the create-table half did). Re-applies the column adds
-- idempotently so the webhook sync of Stripe cancellation_details has
-- somewhere to write.

alter table public.subscriptions
  add column if not exists stripe_cancellation_reason text,
  add column if not exists stripe_cancellation_feedback text,
  add column if not exists stripe_cancellation_comment text,
  add column if not exists cancel_at timestamptz;
