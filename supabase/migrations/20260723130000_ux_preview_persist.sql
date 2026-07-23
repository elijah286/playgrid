-- Persist the new-UX preview opt-in on the account instead of a per-browser cookie.
--
-- Motivation
-- ----------
-- The `new_shell` preview opt-in used to live in a per-browser SESSION cookie
-- (`xo_ux_preview`). That meant enabling the preview on one device (e.g. a phone)
-- never carried to another (e.g. desktop), and it cleared on every browser close.
-- A tester who "turned it on for my account" only turned it on for one browser.
--
-- This moves the ACTIVE opt-in to a per-user profile flag so it follows the
-- account across every device and survives browser restarts, until the user
-- explicitly switches back to Production.
--
-- Scope note
-- ----------
-- This only changes WHERE the active opt-in is stored. Availability ("who is even
-- allowed to preview") is unchanged — still governed by the `new_shell` beta flag
-- scope + allowlist (see resolveUxPreview / beta_feature_allowlist).
--
-- Safety
-- ------
-- Additive, default FALSE. Every existing user keeps the production experience by
-- default — only an explicit opt-in flips this true. No DROP/DELETE.

alter table public.profiles
  add column if not exists ux_preview_active boolean not null default false;

comment on column public.profiles.ux_preview_active is
  'Per-account opt-in to the new-UX preview shell (/app). Replaces the old per-browser xo_ux_preview session cookie so the choice follows the account across devices. Gated by the new_shell allowlist regardless.';
