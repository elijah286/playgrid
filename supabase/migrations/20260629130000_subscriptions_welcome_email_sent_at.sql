-- Coach-plan welcome email idempotency column.
--
-- When a coach purchases the Team Coach plan, the Stripe webhook fires a
-- one-shot welcome email: thanks them for the purchase, frames XO Gridmaker
-- as a new product we're actively building, and asks for feedback / questions
-- (admin@xogridmaker.com → replies route straight to the founder).
--
-- Stripe retries webhooks and can re-deliver checkout.session.completed /
-- customer.subscription.created more than once; this column lets the handler
-- claim the send exactly once via an UPDATE-with-guard, so retries are no-ops.

alter table public.subscriptions
  add column if not exists welcome_email_sent_at timestamptz;

-- Backfill: stamp every PRE-EXISTING coach subscription older than 30 days so
-- the live webhook trigger can never retroactively email long-time customers.
-- Subscriptions created within the last 30 days are left NULL on purpose —
-- that recent cohort is emailed by the reviewed one-off backfill script
-- (scripts/send-welcome-coach-backfill.ts), not by a stray webhook event.
update public.subscriptions
  set welcome_email_sent_at = now()
  where tier = 'coach'
    and welcome_email_sent_at is null
    and created_at < now() - interval '30 days';

-- Partial index supports the eligibility check cheaply once the table grows:
-- "coach subscriptions that haven't received the welcome email yet."
create index if not exists subscriptions_welcome_email_pending_idx
  on public.subscriptions (stripe_subscription_id)
  where welcome_email_sent_at is null
    and tier = 'coach';
