-- Idempotent claim marker for admin device-push fan-out.
--
-- system_notices is the canonical, deduplicated feed of operational events
-- (signups, purchases, cancellations) written by SECURITY DEFINER triggers.
-- Native push to site admins is a downstream PROJECTION of that feed: the app
-- reads fresh notices at the two natural touchpoints (auth callback for
-- signups, Stripe webhook for subscription changes) and fans them out.
--
-- pushed_at lets that projection claim each notice exactly once — the dispatch
-- does `update ... set pushed_at = now() where id = $1 and pushed_at is null
-- returning ...`, so a repeated auth callback or a duplicate webhook can never
-- double-notify. Additive and nullable; existing rows stay unclaimed (null)
-- and are simply never retro-pushed because the projection filters on recency.
alter table public.system_notices
  add column if not exists pushed_at timestamptz;
