-- Coach Cal cost-budget top-ups.
--
-- The Cal rate limit moved from a monthly message *count* to a cost-based
-- model (three rolling/calendar windows measured in micro-USD against
-- coach_ai_token_usage). Message packs are re-wired accordingly: a pack
-- purchase now grants a fixed slice of monthly *cost budget* instead of a
-- message count.
--
-- Mirrors the existing purchased_messages / purchased_messages_month pair:
-- the grant only counts toward the current month; getCoachCalCostState
-- ignores it once the month rolls over. A second pack in the same month
-- adds to the running total (handled in the Stripe webhook).

alter table public.owner_seat_grants
  add column if not exists purchased_budget_micros bigint not null default 0,
  add column if not exists purchased_budget_month date;
