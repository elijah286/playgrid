-- Site-admin in-app notifications for the App Store rating nudge.
--
-- The rating nudge (RatingNudge.tsx) now runs the "are you enjoying the app?"
-- gate before ever inviting a public review: happy coaches are sent to the App
-- Store, unhappy coaches are routed to private in-app feedback (which already
-- emits a 'feedback_received' notice). This migration adds the third outcome —
-- what the coach actually did on the prompt — to the EXISTING system_notices
-- pipeline so an admin can see, in the inbox bell + drawer, whether a coach left
-- a review or dismissed the nudge.
--
-- Two terminal outcomes ride the new 'review_prompt' kind:
--   • rated     → "<who> is enjoying the app and left an App Store review",
--                 href = the store's public reviews page (the closest thing to
--                 a link to "that review" — Apple/Google expose no per-review
--                 URL and no submit callback, so this is the reviews listing).
--   • dismissed → "<who> saw the rating prompt and dismissed it".
-- The unhappy path is intentionally NOT a review_prompt row — it lands in
-- public.feedback and reuses the 'feedback_received' notice (which carries the
-- coach's words + a link to the Feedback tab), so there's no double-notify.
--
-- Unlike signups/feedback, these rows are written directly by a server action
-- via the service-role client (see recordRatingOutcome in
-- src/app/actions/rating-prompt.ts) rather than a source-table trigger — there
-- is no natural source row for "tapped a button in a modal". system_notices has
-- no INSERT RLS policy, so only server-side/service-role code can write them;
-- nothing user-facing can forge a notice.
--
-- review_prompt is deliberately kept OUT of ADMIN_PUSH_NOTICE_KINDS (see
-- inbox-dispatch.ts): like play_milestone it's engagement telemetry for the
-- in-app feed, not a device-interrupt-worthy event. The unhappy path still
-- buzzes phones via feedback_received, which is the high-signal case.

alter table public.system_notices
  drop constraint if exists system_notices_kind_check;
alter table public.system_notices
  add constraint system_notices_kind_check check (kind in (
    'user_signup',
    'subscription_purchased',
    'subscription_canceled',
    'play_milestone',
    'feedback_received',
    'functional_test_failed',
    'review_prompt'
  ));
