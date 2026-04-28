-- Per-user bonus Coach Cal messages, additive on top of the tier
-- monthly cap (currently 200 for Coach Pro). Sits on the existing
-- owner_seat_grants row alongside bonus_seats — same admin-comp lever.

alter table public.owner_seat_grants
  add column if not exists bonus_messages int not null default 0;

alter table public.owner_seat_grants
  add constraint owner_seat_grants_bonus_messages_nonneg
    check (bonus_messages >= 0) not valid;
alter table public.owner_seat_grants
  validate constraint owner_seat_grants_bonus_messages_nonneg;
