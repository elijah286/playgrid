-- Split the single `allow_duplication` flag into per-role flags so owners
-- can restrict coaches and players independently.
alter table public.playbooks
  add column if not exists allow_coach_duplication boolean not null default true,
  add column if not exists allow_player_duplication boolean not null default true;

-- Backfill: whatever the old flag was, copy into both per-role flags.
update public.playbooks
  set allow_coach_duplication = allow_duplication,
      allow_player_duplication = allow_duplication
where allow_duplication is not null;

alter table public.playbooks drop column if exists allow_duplication;
