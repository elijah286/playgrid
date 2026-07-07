-- Example-playbook promotion mode for the new-user empty state.
--
-- Controls how prominently the "Start from an example" CTA is shown to coaches
-- with no playbooks yet (the first-run activation moment):
--   'off'      — subtle text link only (current behavior)
--   'ab'       — half of users (deterministic bucket) get the prominent CTA,
--                half get the subtle link, so we can measure the activation lift
--   'everyone' — every new user gets the prominent CTA
--
-- Additive; defaults to 'off' so behavior is unchanged until an admin opts in.
alter table public.site_settings
  add column if not exists example_promo_mode text not null default 'off'
    check (example_promo_mode in ('off', 'ab', 'everyone'));
