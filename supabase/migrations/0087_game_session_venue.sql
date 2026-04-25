-- Capture where a game was played. Populated opportunistically from the
-- coach's device GPS on game-mode start (native app) or from the browser
-- Geolocation API on the web. All columns nullable: a coach who declines
-- the prompt simply ends up with a session that has no venue.
--
-- `venue_label` is reserved for a future reverse-geocoded or coach-edited
-- name; we don't populate it from the client yet but the column is here
-- so a later UI can write to it without another migration.
alter table public.game_sessions
  add column if not exists venue_lat double precision,
  add column if not exists venue_lng double precision,
  add column if not exists venue_accuracy_m double precision,
  add column if not exists venue_label text,
  add column if not exists venue_captured_at timestamptz;
