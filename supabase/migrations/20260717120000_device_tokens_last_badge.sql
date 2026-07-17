-- The app-icon badge is a one-way ratchet on any build without the
-- @capawesome/capacitor-badge plugin (iOS <= 1.0.1 / build 11): the server sets
-- aps.badge on every push, but the on-open native clear (NativeBadgeSync ->
-- setAppBadge) can't run, so a badge set while an item was pending stays on the
-- icon forever — coaches see "1" over an empty inbox.
--
-- APNs is the only lever on those installed builds, so we reconcile by sending a
-- badge-only push. This column records the badge value we last sent to each
-- token, which makes that reconcile idempotent by construction: we only push
-- when the live count actually differs from what the icon is already showing.
-- Without it, every 60s poll / reload could re-send the same badge.
--
-- NULL = we have never sent a badge to this token (so there is nothing stuck on
-- the icon to clear, and a count of 0 needs no push).
alter table public.device_tokens
  add column if not exists last_badge integer;

comment on column public.device_tokens.last_badge is
  'Absolute badge value last delivered to this device via aps.badge / notification_count. NULL = never sent. Used to skip no-op badge reconcile pushes; see src/lib/notifications/badge-reconcile.ts.';
