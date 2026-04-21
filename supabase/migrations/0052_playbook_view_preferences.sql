-- Per-user, per-playbook view preferences. Stores the UI state (tab,
-- offense/defense, groupBy, thumbSize, etc.) so filters persist across
-- devices. Survives for the life of the member row.
--
-- Sharing seeds this row from the sharer's current prefs once (first
-- visit), after which the recipient's own edits take over.

create table if not exists public.playbook_view_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, playbook_id)
);

alter table public.playbook_view_preferences enable row level security;

drop policy if exists "view_prefs_self_select" on public.playbook_view_preferences;
create policy "view_prefs_self_select"
  on public.playbook_view_preferences
  for select
  using (user_id = auth.uid());

drop policy if exists "view_prefs_self_upsert" on public.playbook_view_preferences;
create policy "view_prefs_self_upsert"
  on public.playbook_view_preferences
  for insert
  with check (user_id = auth.uid());

drop policy if exists "view_prefs_self_update" on public.playbook_view_preferences;
create policy "view_prefs_self_update"
  on public.playbook_view_preferences
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "view_prefs_self_delete" on public.playbook_view_preferences;
create policy "view_prefs_self_delete"
  on public.playbook_view_preferences
  for delete
  using (user_id = auth.uid());

-- Snapshot the sharer's current prefs onto the invite so the invitee can
-- inherit them on first visit.
alter table public.playbook_invites
  add column if not exists filters_snapshot jsonb;

-- Seed helper: insert a prefs row for (target_user, playbook) only if it
-- doesn't already exist. Used at share/accept time to give recipients the
-- sharer's filters on first visit without clobbering their own later edits.
-- Security definer because the caller (the sharer) won't have auth.uid()
-- matching the target user_id.
create or replace function public.seed_playbook_view_prefs(
  p_user_id uuid,
  p_playbook_id uuid,
  p_prefs jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_member boolean;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;
  -- Only sharers (owners/editors on the playbook) can seed someone else's
  -- prefs. This prevents a random user from writing prefs for arbitrary
  -- accounts.
  select exists (
    select 1 from public.playbook_members
    where playbook_id = p_playbook_id
      and user_id = v_caller
      and role in ('owner', 'editor')
  ) into v_is_member;
  if not v_is_member and v_caller <> p_user_id then
    raise exception 'not permitted to seed prefs for this playbook';
  end if;

  insert into public.playbook_view_preferences (user_id, playbook_id, preferences)
  values (p_user_id, p_playbook_id, coalesce(p_prefs, '{}'::jsonb))
  on conflict (user_id, playbook_id) do nothing;
end;
$$;

grant execute on function public.seed_playbook_view_prefs(uuid, uuid, jsonb) to authenticated;
