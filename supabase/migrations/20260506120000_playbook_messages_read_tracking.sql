-- Per-member read tracking for playbook chat. Drives the unread badge on
-- the Messages tab + the inbox notification surface.
--
-- One column on playbook_members is enough — we don't need per-message
-- read receipts (the user explicitly opted out earlier). The unread count
-- is just `count(messages where created_at > last_read_messages_at and
-- author_id != viewer)`.
--
-- Defaults to NULL so existing members start with "everything unread"
-- which is fine: the first time they open the Messages tab the action
-- stamps `now()` and the count goes to zero. We coalesce NULL → epoch
-- in the count query so the math works.

alter table public.playbook_members
  add column if not exists last_read_messages_at timestamptz;

comment on column public.playbook_members.last_read_messages_at is
  'Timestamp of the most recently read message in this playbook for this member. NULL means the user has never opened the chat. Updated by markPlaybookMessagesReadAction.';
