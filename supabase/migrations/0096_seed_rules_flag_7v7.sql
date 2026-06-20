-- Seed Coach AI knowledge base with 7v7 flag football rules.
--
-- 7v7 is governed by multiple bodies (Pylon, OT7, USA Football, regional
-- leagues) with meaningful differences. This seed captures rules that are
-- broadly common across 7v7 organizations and is sanctioning_body=null so
-- it surfaces regardless of which body the playbook is tagged with.
-- Body-specific deltas should be added as separate documents later.
--
-- All rows authoritative=false / needs_review=true.
--
-- Rebuild-from-scratch guard: these rules seeds (0096–0103) historically run
-- before 0115 created rag_documents / rag_document_revisions. On an existing
-- database (including production) the tables already exist, so the blocks below
-- are harmless no-ops; on a fresh `supabase db reset` they let the seeds apply
-- in order. 0115 stays the canonical definition (indexes, RLS, policies, comments).
create extension if not exists vector;

create table if not exists public.rag_documents (
  id                uuid        primary key default gen_random_uuid(),
  scope             text        not null check (scope in ('global','playbook')),
  scope_id          uuid,
  topic             text        not null,
  subtopic          text,
  title             text        not null,
  content           text        not null,
  sport_variant     text,
  game_level        text,
  sanctioning_body  text,
  age_division      text,
  -- Includes 'catalog' (the value the later 20260512 migration widens this
  -- check to) so the GENERATED catalog seed (0200) applies on a fresh rebuild
  -- without hand-editing it. End-state constraint is identical to production.
  source            text        not null check (source in ('seed','admin_chat','coach_chat','official_pdf','catalog')),
  source_url        text,
  source_note       text,
  authoritative     boolean     not null default false,
  needs_review      boolean     not null default false,
  last_verified_at  timestamptz,
  verified_by       uuid        references auth.users(id) on delete set null,
  created_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  retired_at        timestamptz,
  embedding         vector(1536),
  constraint rag_documents_scope_id_check check (
    (scope = 'global'   and scope_id is null) or
    (scope = 'playbook' and scope_id is not null)
  )
);

create table if not exists public.rag_document_revisions (
  id                uuid        primary key default gen_random_uuid(),
  document_id       uuid        not null references public.rag_documents(id) on delete cascade,
  revision_number   int         not null,
  title             text        not null,
  content           text        not null,
  source            text        not null,
  source_url        text,
  source_note       text,
  authoritative     boolean     not null,
  needs_review      boolean     not null,
  change_kind       text        not null check (change_kind in ('create','edit','verify','retire','restore')),
  change_summary    text,
  changed_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (document_id, revision_number)
);

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

('global', null,
 'rules', 'field',
 '7v7 Flag — Field dimensions',
 'Played on a 40-yard field with two 10-yard end zones (60 yards total). Width is typically 30-35 yards (often a high school hash-to-hash width). The first down line is at the 25-yard line going in.',
 'flag_7v7', null, 'seed',
 'Field size varies by league. Pylon and OT7 commonly use 40-yard fields; some leagues use 53.3 yards (full hash width).',
 false, true),

('global', null,
 'rules', 'players',
 '7v7 Flag — Players on field',
 'Each team fields 7 players: typically a QB, a center, and 5 skill players (receivers / running backs). Defenses align with 7 defenders, almost always in coverage shells. There are no offensive or defensive linemen.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null,
 'rules', 'no_rush',
 '7v7 Flag — No pass rush',
 '7v7 is a passing-only competition. There is no pass rush. The QB must release the ball within a fixed time limit (commonly 4 seconds). If the QB still has the ball at the time limit, the play is dead and counts as a sack / loss of down.',
 'flag_7v7', null, 'seed',
 'Some leagues use a 3.5- or 4.5-second clock. Verify per league.',
 false, true),

('global', null,
 'rules', 'pass_clock',
 '7v7 Flag — Pass clock',
 'Common pass clock is 4 seconds from the snap. The clock starts when the ball is snapped and stops when the ball leaves the QB''s hand. Beating the clock by a tenth is a release; failing to release is treated as a sack at the line of scrimmage.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null,
 'rules', 'no_run',
 '7v7 Flag — No running plays',
 'There are no designed run plays. The QB cannot run for yardage; scrambling is allowed only to extend a passing play. Handoffs, sweeps, and reverses are not part of 7v7.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null,
 'rules', 'snap',
 '7v7 Flag — Snap',
 'The ball is snapped from a stationary center. Some leagues allow a sideways snap rather than between the legs. The center is typically not eligible to receive a pass; in some leagues the center may be eligible after a brief delay.',
 'flag_7v7', null, 'seed',
 'Center eligibility varies by league.',
 false, true),

('global', null,
 'rules', 'downs',
 '7v7 Flag — Downs and line to gain',
 'Offense gets 4 downs to cross the 25-yard line (first down) and then 4 more downs to score. Failure to convert results in a turnover on downs at the spot. There are no punts.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null,
 'rules', 'scoring',
 '7v7 Flag — Scoring',
 'Touchdown = 6 points. Extra point from the 5-yard line = 1 point. Extra point from the 10-yard line = 2 points. Defensive interception returned for a touchdown = 6 points. Defensive interception returned on an extra point attempt = 3 points (some leagues). Safety scoring is uncommon in 7v7 since there is no run game.',
 'flag_7v7', null, 'seed',
 'Defensive PAT return value varies (often 2 or 3). Verify per league.',
 false, true),

('global', null,
 'rules', 'motion',
 '7v7 Flag — Motion',
 'One player may be in motion at the snap, parallel to or away from the line of scrimmage. Motion toward the line of scrimmage is illegal. Stack and bunch formations are allowed; pick / rub routes are legal in many leagues but a foul in others.',
 'flag_7v7', null, 'seed',
 'Pick-route legality varies sharply between Pylon, OT7, and other leagues.',
 false, true),

('global', null,
 'rules', 'flag_pull',
 '7v7 Flag — Flag pulls and contact',
 'A receiver is down when their flag is pulled, when they step out of bounds, or when the ball touches the ground. Defenders may not hold, push, or strip the ball. Bump coverage at the line is restricted (typically allowed within 5 yards, similar to NFL chuck rules) or prohibited entirely depending on the league.',
 'flag_7v7', null, 'seed',
 'Bump coverage rules vary. Verify per league.',
 false, true),

('global', null,
 'rules', 'interceptions',
 '7v7 Flag — Interceptions',
 'Interceptions are live and may be returned. A returned interception ends the offensive possession; the defense may score 6 points by reaching the end zone. After a non-scoring interception, the intercepting team becomes the offense at the spot or at a designated yard line (varies by league).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null,
 'rules', 'penalties',
 '7v7 Flag — Common penalties',
 'Common offense: false start (5 yards), illegal motion (5 yards), offensive pass interference (10 yards, loss of down), illegal pick (10 yards), flag guarding (10 yards from spot), intentional grounding (loss of down). Common defense: defensive pass interference (spot foul, automatic first down), holding (10 yards, automatic first down), illegal contact (5 yards, automatic first down), unnecessary roughness (15 yards, possible ejection).',
 'flag_7v7', null, 'seed',
 'Yardages vary. Verify per league.',
 false, true),

('global', null,
 'rules', 'overtime',
 '7v7 Flag — Overtime',
 'Overtime is typically a series-by-series shootout from the 10-yard line. Each team gets 4 downs to score; if both score (or neither scores), another round is played. Some tournaments use a 5-yard 1-point / 10-yard 2-point format.',
 'flag_7v7', null, 'seed',
 'OT format varies sharply. Verify per league/tournament.',
 false, true),

('global', null,
 'rules', 'prohibited',
 '7v7 Flag — Prohibited actions',
 'Prohibited at all times: any pass rush, designed run plays, QB runs for yardage, blocking of any kind, stiff-arming, diving, jumping or hurdling defenders, flag guarding, stripping the ball, defensive holding, and bumping receivers beyond the league-specific window.',
 'flag_7v7', null, 'seed', null, false, true);

-- Initial revision rows.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select
  d.id, 1,
  d.title, d.content, d.source, d.source_note,
  d.authoritative, d.needs_review,
  'create', 'Initial seed (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_7v7'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
