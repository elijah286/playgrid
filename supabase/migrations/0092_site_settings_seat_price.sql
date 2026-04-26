-- Per-seat add-on Stripe price IDs. One per billing interval — the seat
-- line item on a subscription must match the interval of the main plan,
-- so we need both. Owners on monthly Coach buy seats at the monthly
-- price; annual plans use the annual price.

alter table public.site_settings
  add column if not exists stripe_price_seat_month text,
  add column if not exists stripe_price_seat_year text;
