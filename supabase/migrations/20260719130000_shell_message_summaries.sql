-- Cross-team message summaries for the new-UX shell's Messages list, in ONE
-- round-trip instead of 2 queries per team (last message + unread count).
--
-- Read-only + scoped strictly to the caller's own active memberships. Only the
-- new shell calls this; production is untouched. SECURITY DEFINER (so it isn't
-- slowed by per-row RLS re-checks) but every row is filtered on auth.uid(), so
-- it can only ever return the caller's own teams' data — the author display
-- name it exposes is already visible to the caller inside that team's chat.

create or replace function public.shell_message_summaries()
returns table (
  playbook_id uuid,
  last_body text,
  last_created_at timestamptz,
  last_author_name text,
  last_deleted boolean,
  unread integer
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select pm.playbook_id,
           coalesce(pm.last_read_messages_at, 'epoch'::timestamptz) as last_read
    from public.playbook_members pm
    where pm.user_id = auth.uid() and pm.status = 'active'
  ),
  last_msg as (
    select distinct on (m.playbook_id)
      m.playbook_id, m.body, m.created_at, m.deleted_at, m.author_id
    from public.playbook_messages m
    where m.playbook_id in (select playbook_id from mine)
    order by m.playbook_id, m.created_at desc
  ),
  unread_cnt as (
    select m.playbook_id, count(*)::integer as unread
    from public.playbook_messages m
    join mine on mine.playbook_id = m.playbook_id
    where m.deleted_at is null
      and m.author_id <> auth.uid()
      and m.created_at > mine.last_read
    group by m.playbook_id
  )
  select
    mine.playbook_id,
    lm.body           as last_body,
    lm.created_at     as last_created_at,
    pr.display_name   as last_author_name,
    (lm.deleted_at is not null) as last_deleted,
    coalesce(uc.unread, 0)      as unread
  from mine
  left join last_msg   lm on lm.playbook_id = mine.playbook_id
  left join unread_cnt uc on uc.playbook_id = mine.playbook_id
  left join public.profiles pr on pr.id = lm.author_id;
$$;

grant execute on function public.shell_message_summaries() to authenticated;
