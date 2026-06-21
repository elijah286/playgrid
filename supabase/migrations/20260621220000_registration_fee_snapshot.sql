-- Snapshot the registration fee per registration (Track B — financials).
--
-- Purchases already snapshot their price; the base fee did not. Snapshotting it
-- at submit time makes the financials view accurate even if the operator later
-- changes the fee. Nullable: existing rows fall back to the current window fee
-- in the aggregation.

alter table public.player_registrations
  add column if not exists fee_cents integer;
