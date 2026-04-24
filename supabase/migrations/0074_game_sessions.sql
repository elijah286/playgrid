-- Coach-facing game sessions: a record of a single game played using
-- game mode, plus the ordered list of plays called during that game and
-- a coarse outcome (thumbs up/down + optional tag) for each call.
--
-- Both rows are owned by the calling coach (game_sessions.coach_id) and
-- scoped to a single playbook. RLS lets a coach read/write only their
-- own sessions; team-wide review surfaces will come later.

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  opponent text,
  score_us integer,
  score_them integer,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists game_sessions_playbook_idx
  on public.game_sessions (playbook_id, started_at desc);
create index if not exists game_sessions_coach_idx
  on public.game_sessions (coach_id, started_at desc);

create table if not exists public.game_plays (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  play_id uuid not null references public.plays(id) on delete cascade,
  -- The version of the play that was on screen when it was called. Stored
  -- so a future review screen can re-render the exact play the coach saw,
  -- even if the play is edited later. Nullable to tolerate plays without
  -- a current_version_id at log time.
  play_version_id uuid references public.play_versions(id) on delete set null,
  position integer not null,
  called_at timestamptz not null,
  -- Coarse outcome. null = no thumb tapped.
  thumb text check (thumb in ('up', 'down')),
  -- Up tags: 'yards' | 'first_down' | 'score'
  -- Down tags: 'loss' | 'flag' | 'incomplete' | 'fumble'
  tag text
);

create index if not exists game_plays_session_idx
  on public.game_plays (session_id, position);

alter table public.game_sessions enable row level security;
alter table public.game_plays enable row level security;

-- Coaches can only see their own sessions.
create policy game_sessions_select_own
  on public.game_sessions
  for select
  using (coach_id = auth.uid());

create policy game_sessions_insert_own
  on public.game_sessions
  for insert
  with check (coach_id = auth.uid());

-- game_plays inherit visibility from their session — a coach sees the
-- plays of their own sessions only.
create policy game_plays_select_via_session
  on public.game_plays
  for select
  using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.coach_id = auth.uid()
    )
  );

create policy game_plays_insert_via_session
  on public.game_plays
  for insert
  with check (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.coach_id = auth.uid()
    )
  );
