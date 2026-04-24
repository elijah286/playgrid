-- Track whether a live session was a real game or a scrimmage. Coaches
-- want separate review surfaces for these later, and defaults to 'game'
-- so historical rows and the common case need no extra input.

alter table public.game_sessions
  add column if not exists kind text not null default 'game'
    check (kind in ('game', 'scrimmage'));
