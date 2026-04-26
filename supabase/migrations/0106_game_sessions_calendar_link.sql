-- Optional FK from game_sessions to playbook_events. The Games tab
-- merges scheduled events with live/ended sessions; this link lets a
-- session inherit the event's metadata (date, opponent, location) and
-- lets the UI collapse a scheduled+played pair into one row.
--
-- on delete set null so deleting a calendar event never destroys the
-- session record (the session has its own play-by-play data).

alter table public.game_sessions
  add column if not exists calendar_event_id uuid
    references public.playbook_events (id) on delete set null;

create index if not exists game_sessions_calendar_event_idx
  on public.game_sessions (calendar_event_id)
  where calendar_event_id is not null;
