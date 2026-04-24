-- Live, multi-coach game sessions.
--
-- Before this migration, game_sessions was a historical record written at
-- the end of a game by a single coach. Now a session is created at the
-- START of a game and lives with status='active' until one of:
--   * the caller ends it (status -> 'ended'), or
--   * heartbeat staleness sweeps it (assertNoActiveGameSession auto-ends).
--
-- While active, any Team Coach on the playbook can join, score plays
-- (last-write-wins), and take over as the caller. Only the current caller
-- can advance plays or end the session.
--
-- Edit lock: while a row for a playbook has status='active', every
-- play/playbook mutation action checks and refuses (see
-- src/lib/game-mode/assert-no-active-session.ts).

create type public.game_session_status as enum ('active', 'ended');

alter table public.game_sessions
  add column status public.game_session_status not null default 'ended',
  add column caller_user_id uuid references auth.users(id) on delete set null,
  add column caller_changed_at timestamptz,
  add column current_play_id uuid references public.plays(id) on delete set null,
  add column next_play_id uuid references public.plays(id) on delete set null;

-- Active sessions have no ended_at yet.
alter table public.game_sessions alter column ended_at drop not null;

-- Exactly one active session per playbook. The partial index enforces it.
create unique index if not exists game_sessions_one_active_per_playbook
  on public.game_sessions (playbook_id)
  where status = 'active';

-- Participants: who is currently connected to a session (caller + spectators).
-- last_seen_at is heartbeated every ~20s by the client; staleness detection
-- uses it to decide when a session is dead.
create table if not exists public.game_session_participants (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists game_session_participants_last_seen_idx
  on public.game_session_participants (session_id, last_seen_at desc);

alter table public.game_session_participants enable row level security;

-- ---------------------------------------------------------------------------
-- RLS rework: any coach of the playbook can see/write the session, not just
-- the original author. Historical sessions (status='ended') stay readable
-- by anyone who can still view the playbook.
-- ---------------------------------------------------------------------------

drop policy if exists game_sessions_select_own on public.game_sessions;
drop policy if exists game_sessions_insert_own on public.game_sessions;

create policy game_sessions_select_member on public.game_sessions
  for select using (public.can_view_playbook(playbook_id));

create policy game_sessions_insert_coach on public.game_sessions
  for insert with check (public.can_edit_playbook(playbook_id));

create policy game_sessions_update_coach on public.game_sessions
  for update using (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));

drop policy if exists game_plays_select_via_session on public.game_plays;
drop policy if exists game_plays_insert_via_session on public.game_plays;

create policy game_plays_select_member on public.game_plays
  for select using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and public.can_view_playbook(s.playbook_id)
    )
  );

create policy game_plays_insert_coach on public.game_plays
  for insert with check (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and public.can_edit_playbook(s.playbook_id)
    )
  );

-- Any scoring coach can update the call row (last-write-wins).
create policy game_plays_update_coach on public.game_plays
  for update using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and public.can_edit_playbook(s.playbook_id)
    )
  )
  with check (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and public.can_edit_playbook(s.playbook_id)
    )
  );

-- Participant policies: a coach can see all participants of any session in
-- a playbook they coach; they can only insert/update/delete their own row.
create policy gsp_select_coach on public.game_session_participants
  for select using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and public.can_view_playbook(s.playbook_id)
    )
  );

create policy gsp_insert_self on public.game_session_participants
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.game_sessions s
      where s.id = session_id and public.can_edit_playbook(s.playbook_id)
    )
  );

create policy gsp_update_self on public.game_session_participants
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy gsp_delete_self on public.game_session_participants
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: broadcast INSERT/UPDATE/DELETE on these tables so connected
-- clients see caller changes, new calls, and score updates without polling.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.game_plays;
alter publication supabase_realtime add table public.game_session_participants;
