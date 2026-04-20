-- Allow coaches to say "Other" in the create dialog and specify a player count
-- in the 4–11 range (e.g. flag variants not covered by the fixed variants).
-- Nullable: populated only for the "Other" (six_man) variant today.

alter table public.playbooks
  add column if not exists custom_offense_count smallint
    check (custom_offense_count is null or (custom_offense_count between 4 and 11));
