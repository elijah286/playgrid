-- Site-admin in-app notifications when a coach submits feedback.
--
-- Until now, feedback reached the founder only by email: the contact/support
-- form and the cancellation survey emailed admin@, and the in-app feedback
-- widget notified no one at all. A founder who misses (or filters) that email
-- never learns a coach is stuck — exactly how a cancellable bug report sat
-- unanswered for days. ("I tried to reach out to support … no response.")
--
-- This wires feedback into the EXISTING system_notices pipeline
-- (20260506180000): a SECURITY DEFINER trigger on each feedback source writes a
-- 'feedback_received' notice, and from there the existing machinery takes over
-- with zero per-call code:
--   • buildAdminNoticeAlerts() surfaces it in every site admin's inbox bell
--     (badge-counted) and drawer, live (no push required to be visible);
--   • sweepUnpushedAdminNotices() — the every-minute cron — fans it out to admin
--     devices, idempotently (pushed_at claim), once 'feedback_received' is added
--     to ADMIN_PUSH_NOTICE_KINDS in inbox-dispatch.ts.
--
-- Sources covered (both already land in tables; one trigger each):
--   public.feedback                           → widget submissions + /api/contact support form
--   public.subscription_cancellation_feedback → in-app cancellation survey (the WHY)
--
-- Writes happen only through these SECURITY DEFINER triggers; system_notices has
-- no insert RLS policy, so nothing user-facing can forge a notice.

-- 1) Allow the new notice kind. The constraint is unnamed-inline in the original
--    table DDL; Postgres named it system_notices_kind_check. Drop + re-add.
alter table public.system_notices
  drop constraint if exists system_notices_kind_check;
alter table public.system_notices
  add constraint system_notices_kind_check check (kind in (
    'user_signup',
    'subscription_purchased',
    'subscription_canceled',
    'play_milestone',
    'feedback_received'
  ));

-- 2) Trigger: feedback insert (widget or contact form) → 'feedback_received'.
--    Contact-form rows carry name/email inline with a null user_id; widget rows
--    carry user_id only, so resolve name/email from profiles + auth.users the
--    same way the signup trigger does. The body embeds a one-line excerpt so the
--    founder gets the gist straight from the notification.
create or replace function public.system_notice_after_feedback_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_who text;
  v_excerpt text;
  v_is_contact boolean := (new.source = 'contact');
begin
  if new.user_id is not null then
    select p.display_name into v_name from public.profiles p where p.id = new.user_id;
    select u.email into v_email from auth.users u where u.id = new.user_id;
  end if;
  -- Prefer the inline contact name/email, fall back to the resolved profile.
  v_name  := coalesce(nullif(trim(new.name), ''), nullif(trim(v_name), ''));
  v_email := coalesce(nullif(trim(new.email), ''), nullif(trim(v_email), ''));
  v_who   := coalesce(v_name, v_email, 'Someone');

  -- Collapse whitespace and cap the excerpt so the inbox row stays one line.
  v_excerpt := regexp_replace(trim(new.message), '\s+', ' ', 'g');
  if char_length(v_excerpt) > 140 then
    v_excerpt := left(v_excerpt, 139) || '…';
  end if;

  insert into public.system_notices(kind, severity, user_id, user_display_name, user_email, body, href, detail)
  values (
    'feedback_received',
    'warn',
    new.user_id,
    v_name,
    v_email,
    v_who
      || (case when v_is_contact then ' sent a support message: “' else ' sent feedback: “' end)
      || v_excerpt || '”',
    '/settings?tab=feedback',
    jsonb_build_object('feedback_id', new.id, 'source', new.source)
  );

  return new;
end;
$$;

drop trigger if exists trg_system_notice_feedback_insert on public.feedback;
create trigger trg_system_notice_feedback_insert
  after insert on public.feedback
  for each row execute function public.system_notice_after_feedback_insert();

-- 3) Trigger: cancellation-survey insert → 'feedback_received'. The subscriptions
--    trigger already emits 'subscription_canceled' (the WHAT); this carries the
--    coach's own words (the WHY) — the actionable part a founder needs to see,
--    and which previously only ever arrived by email. Links to the users tab so
--    the founder can find the account and reach out; the comment itself rides in
--    the notification body.
create or replace function public.system_notice_after_cancellation_feedback_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_who text;
  v_excerpt text;
begin
  select p.display_name into v_name from public.profiles p where p.id = new.user_id;
  select u.email into v_email from auth.users u where u.id = new.user_id;
  v_who := coalesce(nullif(trim(v_name), ''), nullif(trim(v_email), ''), 'Someone');

  v_excerpt := regexp_replace(trim(new.message), '\s+', ' ', 'g');
  if char_length(v_excerpt) > 140 then
    v_excerpt := left(v_excerpt, 139) || '…';
  end if;

  insert into public.system_notices(kind, severity, user_id, user_display_name, user_email, body, href, detail)
  values (
    'feedback_received',
    'warn',
    new.user_id,
    v_name,
    v_email,
    v_who || ' canceled and left feedback: “' || v_excerpt || '”',
    -- The free-text cancellation comment renders on the Payments tab
    -- (CancellationFeedbackSection), NOT the Users tab — link there so the
    -- click lands on the actual comment, not an unfiltered user list.
    '/settings?tab=payments',
    jsonb_build_object('cancellation_feedback_id', new.id, 'source', 'cancellation')
  );

  return new;
end;
$$;

drop trigger if exists trg_system_notice_cancellation_feedback_insert on public.subscription_cancellation_feedback;
create trigger trg_system_notice_cancellation_feedback_insert
  after insert on public.subscription_cancellation_feedback
  for each row execute function public.system_notice_after_cancellation_feedback_insert();
