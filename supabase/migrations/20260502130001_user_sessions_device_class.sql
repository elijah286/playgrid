-- Add device_class to user_sessions for bucket-scoped concurrent-session caps.
--
-- Policy is now uniform across tiers: 1 desktop + 2 mobile slots. A new
-- desktop sign-in only evicts older desktop sessions; a new mobile sign-in
-- only evicts older mobile sessions. Two mobile slots covers the common
-- phone + tablet pairing without needing fragile tablet detection.
--
-- Capacitor / native-app traffic counts as "mobile" — the wrapper UA token
-- is matched in labelForUserAgent.
--
-- Idempotent: this migration was originally numbered 0200 but collided in the
-- tracker with 0200_catalog_kb_seed.sql. The schema change had already been
-- applied to remote (manually) before the renumber, so the guards here let
-- it re-run as a no-op against any DB that already has the column.

alter table public.user_sessions
  add column if not exists device_class text not null default 'desktop';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_sessions_device_class_check'
  ) then
    alter table public.user_sessions
      add constraint user_sessions_device_class_check
      check (device_class in ('desktop', 'mobile'));
  end if;
end $$;

-- Backfill: rows whose existing device_label says iOS or Android are mobile.
-- Everything else stays desktop (the safe default — worst case a coach sees
-- one extra eviction the next time they sign in on a real mobile device).
-- Only update rows still on the default — re-running mustn't clobber rows
-- a coach has already classified through actual sign-in activity.
update public.user_sessions
set device_class = 'mobile'
where device_label ~* '(iOS|Android)' and device_class = 'desktop';
