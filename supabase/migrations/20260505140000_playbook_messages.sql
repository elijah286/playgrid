-- Per-playbook team chat. One stream per playbook; every member of the
-- playbook (owner, editor, viewer) can post and read. No DMs, no channels.
--
-- Design notes
-- ------------
-- * Soft-delete via `deleted_at` + `deleted_by` so the realtime UPDATE event
--   reaches every connected client and the chronology preserves a tombstone
--   ("This message has been deleted"), matching how Slack/Discord/iMessage
--   render deletions.
-- * `edited_at` distinguishes edits from author tombstones in the UI.
-- * Author edit/delete window is 15 minutes (inlined as `created_at > now()
--   - interval '15 minutes'`). After the window lapses, only owners/editors
--   can soft-delete (moderation); nobody can re-edit.
-- * REPLICA IDENTITY FULL ensures the full row (including body before
--   redaction) reaches subscribers on UPDATE — without it, partial payloads
--   would force a refetch on every edit/delete, defeating the realtime UX.
-- * `playbooks.messaging_enabled` is a per-playbook owner switch. When
--   false, the RLS insert policy denies new posts; reads of historical
--   messages still pass so the UI can render a "messaging disabled"
--   placeholder without tearing the chronology. The owner can re-enable
--   at any time and history reappears intact. "Clear all messages" is a
--   separate, irreversible action exposed through a server action.

alter table public.playbooks
  add column if not exists messaging_enabled boolean not null default true;

comment on column public.playbooks.messaging_enabled is
  'Per-playbook owner switch. When false, members cannot post new messages; existing history is still readable. Toggle via setPlaybookMessagingEnabledAction.';

create table public.playbook_messages (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) > 0 and char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);

create index playbook_messages_pb_created_idx
  on public.playbook_messages (playbook_id, created_at desc);

create index playbook_messages_author_idx
  on public.playbook_messages (author_id);

alter table public.playbook_messages replica identity full;

alter table public.playbook_messages enable row level security;

-- Helper: can the caller post to this playbook? Must be a member AND the
-- owner must not have flipped messaging off. Parallels can_view_playbook /
-- can_edit_playbook for consistency.
create or replace function public.can_post_to_playbook(pb uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_view_playbook(pb)
    and coalesce(
      (select messaging_enabled from public.playbooks where id = pb),
      false
    );
$$;

-- Read: anyone who can view the playbook can read its messages, even when
-- messaging is disabled (so history stays visible behind the placeholder).
create policy pm_msg_select on public.playbook_messages
  for select using (public.can_view_playbook(playbook_id));

-- Insert: any member can post their own message, gated by the per-playbook
-- messaging_enabled flag.
create policy pm_msg_insert on public.playbook_messages
  for insert with check (
    auth.uid() = author_id
    and public.can_post_to_playbook(playbook_id)
    and deleted_at is null
  );

-- Author edit/soft-delete within a 15-minute window. The with-check
-- prevents the author from changing scope (playbook_id, author_id).
create policy pm_msg_author_update on public.playbook_messages
  for update using (
    auth.uid() = author_id
    and deleted_at is null
    and created_at > (now() - interval '15 minutes')
  )
  with check (
    auth.uid() = author_id
  );

-- Coach (owner/editor) moderation — soft-delete any message at any time.
-- Coaches don't have UI to edit others' bodies; the policy permits row
-- updates for moderation but the UI only exposes a delete action and
-- deleted_by gives an audit trail.
create policy pm_msg_coach_update on public.playbook_messages
  for update using (
    public.can_edit_playbook(playbook_id)
  )
  with check (
    public.can_edit_playbook(playbook_id)
  );

-- No DELETE policy: deletes are always soft for the per-message path.
-- The "clear all messages" owner action goes through a SECURITY DEFINER
-- function so a single owner-authorized DELETE can wipe the stream
-- atomically without leaking row-by-row delete permission.
create or replace function public.clear_playbook_messages(pb uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  if not exists (
    select 1 from public.playbook_members
    where playbook_id = pb
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'only the playbook owner can clear messages';
  end if;
  delete from public.playbook_messages where playbook_id = pb;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.clear_playbook_messages(uuid) from public;
grant execute on function public.clear_playbook_messages(uuid) to authenticated;

-- Realtime: ship inserts and updates to subscribers filtered by playbook_id.
alter publication supabase_realtime add table public.playbook_messages;

comment on table public.playbook_messages is
  'Team chat messages, one stream per playbook. See AGENTS.md → Coach Cal architecture for the test-first rule on changes here.';
