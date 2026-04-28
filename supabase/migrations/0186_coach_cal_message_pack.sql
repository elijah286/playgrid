-- Coach Cal one-time message pack: lets a Coach Pro user who's hit the
-- monthly cap buy more messages instead of waiting for reset. The pack
-- expires at month rollover (matches the "credits" mental model).
--
-- - site_settings.stripe_price_coach_cal_pack — Stripe one-time price ID
--   for the pack SKU
-- - site_settings.coach_cal_pack_message_count — how many messages the
--   pack adds (admin-configurable, default 100)
-- - site_settings.coach_cal_pack_price_usd_cents — display price for UI
--   copy (Stripe is the source of truth for the actual charge; admin is
--   responsible for keeping these in sync)
-- - owner_seat_grants.purchased_messages — accumulated pack purchases
--   for the current month; treated as 0 by readers when
--   purchased_messages_month != current month (i.e. month rolled over)
-- - owner_seat_grants.purchased_messages_month — first-of-month UTC
--   date for which purchased_messages applies; null = no purchases yet

alter table public.site_settings
  add column if not exists stripe_price_coach_cal_pack text,
  add column if not exists coach_cal_pack_message_count int not null default 100,
  add column if not exists coach_cal_pack_price_usd_cents int not null default 500;

alter table public.site_settings
  add constraint site_settings_pack_message_count_pos
    check (coach_cal_pack_message_count > 0) not valid;
alter table public.site_settings
  validate constraint site_settings_pack_message_count_pos;

alter table public.site_settings
  add constraint site_settings_pack_price_pos
    check (coach_cal_pack_price_usd_cents > 0) not valid;
alter table public.site_settings
  validate constraint site_settings_pack_price_pos;

alter table public.owner_seat_grants
  add column if not exists purchased_messages int not null default 0,
  add column if not exists purchased_messages_month date;

alter table public.owner_seat_grants
  add constraint owner_seat_grants_purchased_messages_nonneg
    check (purchased_messages >= 0) not valid;
alter table public.owner_seat_grants
  validate constraint owner_seat_grants_purchased_messages_nonneg;
