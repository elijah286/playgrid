-- Let the functional-testing ingest endpoint raise a site-admin notice when a
-- production run fails, so a regression (e.g. invite-accept breaking) pushes
-- every admin the same way signups/cancellations do — the whole point of the
-- harness is to catch this before a customer does.
--
-- Adds 'functional_test_failed' to the system_notices kind constraint. Wired
-- into ADMIN_PUSH_NOTICE_KINDS + adminPushMessage in inbox-dispatch.ts and
-- AdminNoticeKind in inbox.ts. Superset swap (no data impact).

alter table public.system_notices
  drop constraint if exists system_notices_kind_check;
alter table public.system_notices
  add constraint system_notices_kind_check check (kind in (
    'user_signup',
    'subscription_purchased',
    'subscription_canceled',
    'play_milestone',
    'feedback_received',
    'functional_test_failed'
  ));
