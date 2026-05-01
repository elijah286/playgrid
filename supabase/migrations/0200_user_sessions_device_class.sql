-- Add device_class to user_sessions for bucket-scoped concurrent-session caps.
--
-- Policy is now uniform across tiers: 1 desktop + 2 mobile slots. A new
-- desktop sign-in only evicts older desktop sessions; a new mobile sign-in
-- only evicts older mobile sessions. Two mobile slots covers the common
-- phone + tablet pairing without needing fragile tablet detection.
--
-- Capacitor / native-app traffic counts as "mobile" — the wrapper UA token
-- is matched in labelForUserAgent.

alter table public.user_sessions
  add column device_class text not null default 'desktop'
  check (device_class in ('desktop', 'mobile'));

-- Backfill: rows whose existing device_label says iOS or Android are mobile.
-- Everything else stays desktop (the safe default — worst case a coach sees
-- one extra eviction the next time they sign in on a real mobile device).
update public.user_sessions
set device_class = 'mobile'
where device_label ~* '(iOS|Android)';
