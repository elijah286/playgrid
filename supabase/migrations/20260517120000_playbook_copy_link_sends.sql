-- Per-recipient tracking for emailed "Send a copy" links.
--
-- Each emailed recipient gets their own single-use playbook_copy_links
-- row (max_uses = 1, 30d expiry) plus a row in this table mapping that
-- link to the intended email + user. We use it for two things:
--
--   1. Inbox alerts: matched-user sends with claimed_at IS NULL surface
--      a "share" alert on the recipient's dashboard.
--   2. Per-recipient analytics: who was emailed, who claimed.
--
-- The dialog's "main" multi-use copy link stays separate — it has no
-- send row and never produces inbox alerts.

create table public.playbook_copy_link_sends (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null unique references public.playbook_copy_links (id) on delete cascade,
  recipient_email text not null,
  -- Populated at send time if the email matches an existing auth.users.
  -- Stays null for net-new signups; we don't backfill on signup.
  recipient_user_id uuid references auth.users (id) on delete set null,
  sent_by uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null
);

create index playbook_copy_link_sends_recipient_user_idx
  on public.playbook_copy_link_sends (recipient_user_id)
  where claimed_at is null;

create index playbook_copy_link_sends_recipient_email_idx
  on public.playbook_copy_link_sends (recipient_email);

create index playbook_copy_link_sends_sent_by_idx
  on public.playbook_copy_link_sends (sent_by);

alter table public.playbook_copy_link_sends enable row level security;

-- Sender (editors+ on the source playbook) can insert their own send
-- rows. We also gate on can_edit_playbook via the underlying link to
-- match copy_links_insert.
create policy copy_link_sends_insert on public.playbook_copy_link_sends
  for insert with check (
    sent_by = auth.uid()
    and exists (
      select 1 from public.playbook_copy_links cl
      where cl.id = link_id
        and public.can_edit_playbook(cl.playbook_id)
    )
  );

-- Recipient sees their own pending sends (for inbox). Sender sees the
-- sends they originated (for any future "I sent X" history view).
create policy copy_link_sends_select on public.playbook_copy_link_sends
  for select using (
    recipient_user_id = auth.uid()
    or sent_by = auth.uid()
  );

-- Claim marking happens via service role in acceptCopyLinkAction, so
-- no UPDATE policy is needed for end users. (Service role bypasses RLS.)
