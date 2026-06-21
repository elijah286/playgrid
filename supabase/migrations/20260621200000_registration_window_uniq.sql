-- Registration-arc hardening: one league-wide registration window per league.
--
-- The app treats the (league_id, division_id IS NULL) registration_windows row
-- as the league's registration config, but nothing enforced uniqueness — a race
-- (double-click / action retry) could create duplicates, after which the writer
-- and readers could disagree on which row is authoritative (open-after-close /
-- stale fee on the public payment surface). Make it structurally impossible.

-- 1) Collapse any existing duplicates, keeping the oldest league-wide row.
delete from public.registration_windows
where id in (
  select id from (
    select id,
           row_number() over (partition by league_id order by created_at, id) as rn
    from public.registration_windows
    where division_id is null
  ) t
  where t.rn > 1
);

-- 2) Enforce one league-wide config row going forward.
create unique index if not exists registration_windows_league_default_uniq
  on public.registration_windows (league_id)
  where division_id is null;
