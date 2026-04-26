-- Optional film link for a played game. Free-form URL — coaches paste
-- whatever they already use (Hudl, YouTube, Vimeo, Google Drive, Dropbox,
-- etc.). We don't host or transcode video; this is just a pointer the
-- review screen can render as a "Watch film" link.

alter table public.game_sessions
  add column if not exists film_url text;
