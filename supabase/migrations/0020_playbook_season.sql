-- Adds a free-text season label to playbooks (e.g. "Spring 2026").
-- Intentionally a plain text column rather than using the relational
-- public.seasons table, which is currently unused in the app.

alter table public.playbooks
  add column if not exists season text;
