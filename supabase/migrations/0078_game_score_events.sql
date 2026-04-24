-- Live score log for a game session. Each tap (+N / -N / overwrite) is a
-- row so we can attribute score changes to the play that was on the
-- field at the time, and so any coach's update is preserved rather than
-- clobbering a teammate's. The current scoreboard is just the sum of
-- deltas for a given side within the session.

create table if not exists public.game_score_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  -- The play that was on-screen when the score changed, if any. Nullable
  -- so early taps (before the first play is called) still log.
  play_id uuid references public.game_plays(id) on delete set null,
  side text not null check (side in ('us', 'them')),
  -- Signed integer so corrections ("meant to tap opponent") can be undone
  -- via a compensating event without deleting history.
  delta integer not null,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists game_score_events_session_idx
  on public.game_score_events (session_id, created_at);

alter table public.game_score_events enable row level security;

-- Any coach who can view the playbook the session belongs to can read
-- and write scores. Matches the "any coach can score" product rule.
create policy "score events readable by playbook viewers"
  on public.game_score_events for select
  using (
    exists (
      select 1
      from public.game_sessions s
      where s.id = game_score_events.session_id
        and public.can_view_playbook(s.playbook_id)
    )
  );

create policy "score events writable by playbook editors"
  on public.game_score_events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.game_sessions s
      where s.id = game_score_events.session_id
        and public.can_edit_playbook(s.playbook_id)
    )
  );

alter table public.game_score_events replica identity full;
alter publication supabase_realtime add table public.game_score_events;
