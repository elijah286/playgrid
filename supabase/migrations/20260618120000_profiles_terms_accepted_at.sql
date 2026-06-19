-- Affirmative Terms/EULA acceptance (App Store Guideline 1.2).
--
-- Apps with user-generated content must make users agree to terms (a EULA with
-- an objectionable-content clause) before using the app. We record WHEN each
-- user accepted:
--   * Email signup gates on an "I agree" checkbox and records acceptance.
--   * OAuth (Apple/Google) signups — which skip the email form — hit a one-time
--     blocking accept modal mounted in the dashboard layout.
--
-- Existing users are grandfathered (backfilled to their profile created_at) so
-- the live user base is NOT confronted with a blocking modal on next load.
-- Only accounts created AFTER this migration default to NULL → see the gate.
-- A fresh App Review account therefore hits the acceptance step.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

update public.profiles
  set terms_accepted_at = coalesce(created_at, now())
  where terms_accepted_at is null;

comment on column public.profiles.terms_accepted_at is
  'When the user affirmatively accepted the Terms/EULA. NULL = not yet accepted (new signups), gated by the in-app acceptance step. Existing rows were backfilled to created_at at migration time (grandfathered).';
