-- Site-admin configurable default seat counts per tier, plus per-owner
-- bonus seats (admin comp lever). The Stripe webhook still owns
-- purchased_seats; bonus_seats is purely admin-granted and additive on
-- top of the tier default.

alter table public.site_settings
  add column if not exists default_included_seats int not null default 3,
  add column if not exists default_coach_pro_seats int not null default 5;

alter table public.site_settings
  add constraint site_settings_default_included_seats_nonneg
    check (default_included_seats >= 0) not valid;
alter table public.site_settings
  validate constraint site_settings_default_included_seats_nonneg;

alter table public.site_settings
  add constraint site_settings_default_coach_pro_seats_nonneg
    check (default_coach_pro_seats >= 0) not valid;
alter table public.site_settings
  validate constraint site_settings_default_coach_pro_seats_nonneg;

alter table public.owner_seat_grants
  add column if not exists bonus_seats int not null default 0;

alter table public.owner_seat_grants
  add constraint owner_seat_grants_bonus_seats_nonneg
    check (bonus_seats >= 0) not valid;
alter table public.owner_seat_grants
  validate constraint owner_seat_grants_bonus_seats_nonneg;
