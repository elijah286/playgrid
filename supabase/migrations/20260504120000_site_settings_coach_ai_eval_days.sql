-- Configurable Coach AI free-trial / evaluation window. Drives:
--   1. Stripe `trial_period_days` at checkout for new Coach Pro subs.
--   2. The "X-day free trial" copy on every marketing surface (pricing,
--      coach-cal, FAQ, header preview, entry-point upsells, playbook CTA).
--
-- Existing evaluators are unaffected by changes to this value: their
-- subscription's `current_period_end` is locked in by Stripe at checkout
-- time, so shrinking the window only affects new sign-ups.
alter table public.site_settings
  add column if not exists coach_ai_eval_days integer not null default 7
  check (coach_ai_eval_days between 1 and 90);

-- Make sure the existing default row matches the new default (idempotent
-- for fresh DBs that already get 7 from the column default).
update public.site_settings
  set coach_ai_eval_days = 7
  where id = 'default' and coach_ai_eval_days is null;
