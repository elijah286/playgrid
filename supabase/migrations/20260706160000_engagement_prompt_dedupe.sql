-- De-dupe the interruptive "asks" (App Store review nudge + the one-time
-- referral launch announcement) so a coach never gets both at once.
--
--   * last_engagement_prompt_at — the shared cooldown. Any interruptive nudge
--     (review, referral announcement, referral reward push) stamps it on show;
--     all of them check it before firing, so only one lands per window.
--   * referral_announcement_seen_at — the one-time referral announcement fires
--     exactly once per coach; this records that it has.
--
-- Additive, nullable. No backfill needed (null = never prompted / never seen).
alter table public.profiles
  add column if not exists last_engagement_prompt_at timestamptz,
  add column if not exists referral_announcement_seen_at timestamptz;
