-- Coach AI KB — Flag 7v7 rules v2 (dedupe + expansion).
--
-- Step 1: dedupe existing 7v7 seed rows (each was inserted twice).
-- Step 2: expand to ~30 deeper chunks. 7v7 is typically passing-only,
-- HS-affiliated, used for QB/WR skill development.

-- ── Step 1: dedupe ───────────────────────────────────────────────
-- Keep the oldest row per (sport_variant, subtopic, title); retire the rest.
update public.rag_documents r
   set retired_at = now()
  where r.sport_variant = 'flag_7v7'
    and r.source = 'seed'
    and r.retired_at is null
    and exists (
      select 1 from public.rag_documents older
       where older.sport_variant = r.sport_variant
         and older.source = 'seed'
         and older.subtopic = r.subtopic
         and older.title = r.title
         and older.retired_at is null
         and older.created_at < r.created_at
    );

-- ── Step 2: v2 expansion ─────────────────────────────────────────
insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

('global', null, 'rules', 'positions',
 'Flag 7v7 — Personnel and positions',
 '7v7 typically lines up with one QB and six skill players (varying mixes of slot/outside receivers, with one possibly aligned as a back). The center may snap and release as an eligible receiver. There are no offensive linemen — no blocking exists in 7v7. Defenses field one safety / free defender plus six in coverage.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'passing_only',
 'Flag 7v7 — Passing-only format',
 'Most 7v7 leagues are passing-only — no designed runs, no QB scrambles past the line of scrimmage. The format exists for QB and receiver skill development; the run game is absent by design. Some recreational 7v7 variants allow runs; verify with league rules.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'no_pass_rush_detail',
 'Flag 7v7 — Pass rush rules',
 'Most 7v7 leagues have no defensive pass rush. Instead the QB has a fixed time count (commonly 4 seconds, sometimes 3.5 or "Mississippi" cadence) called by the official or a sideline timer. If the QB still has the ball at the count, the play is dead at the previous spot.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'qb_count',
 'Flag 7v7 — The pass count',
 'The most common 7v7 cadence is a 4-second count. Some leagues use a 3-Mississippi or 4-Mississippi out-loud count; others use a silent timer. If the QB releases the ball before the count expires the play continues normally; if not, the ball is dead at the line of scrimmage and the down counts.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'field_dimensions',
 'Flag 7v7 — Field dimensions detail',
 'Field length varies by league: many 7v7 leagues use a full 100-yard high-school field with two 10-yard end zones; some use a shortened 40- or 50-yard field. Width is the standard 53.3 yards (HS) or shortened to 40 in some leagues. The line to gain is typically 15 yards (or a midfield concept similar to flag).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'snap_mechanics',
 'Flag 7v7 — Snap mechanics',
 'The center snaps the ball to the QB to start each play. Direct shotgun snaps are standard. The center is an eligible receiver and may release downfield immediately. Muffed snaps are dead at the spot of the fumble and count as a down.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'completion_rules',
 'Flag 7v7 — Catch / completion rules',
 'Most 7v7 leagues use one-foot-inbounds completion (NFL/HS-style). Possession + control + one foot down = completion. Simultaneous catch goes to the offense. Trapped balls (caught off the ground) are incomplete.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'eligibility_v2',
 'Flag 7v7 — Receiver eligibility',
 'All offensive players except the QB at the snap may be eligible receivers, including the center. Only one forward pass per play, thrown from behind the line of scrimmage. Backward passes (laterals) are unlimited.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'first_downs',
 'Flag 7v7 — First downs and line to gain',
 'Many 7v7 leagues use a midfield-style line to gain (cross midfield in 4 downs, then 4 more to score). HS-affiliated 7v7 sometimes uses standard 10-yard chains. Verify per league.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'turnovers',
 'Flag 7v7 — Turnovers',
 'Interceptions are live and may be returned. Failed downs results in turnover at the dead-ball spot. Fumbles (rare in passing-only) are dead at the spot of the fumble; possession does not change unless league rules specify otherwise.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'scoring_v2',
 'Flag 7v7 — Scoring detail',
 'Touchdown = 6 points. Extra points by passing only: 1 point from the 3-yard line, 2 points from the 10. Defensive return of an extra point attempt = 2 points. Many 7v7 tournaments use point-based scoring tiebreakers (point differential capped per game).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'game_length',
 'Flag 7v7 — Game length and clock',
 'Game length varies widely: tournament pool play is often 20-25 minute halves with a running clock. Bracket games are typically two 20-minute halves. Final two minutes of each half use a stop clock (incompletes, OOB, scores). Some leagues use a single time-bracketed game (e.g., one 25-minute period).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'timeouts_v2',
 'Flag 7v7 — Timeouts',
 'One to two timeouts per half is standard. Officials may stop the clock for injury; that does not count against either team. In tournament play, additional timeouts may be granted between rounds.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'overtime_detail',
 'Flag 7v7 — Overtime detail',
 'Common 7v7 OT format: each team gets one possession from the 10-yard line, one play to score (sometimes 2-3 plays). Tournament play often uses sudden-death possessions until one team scores and the other does not.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'tiebreakers',
 'Flag 7v7 — Pool-play tiebreakers',
 'Tournament tiebreakers in pool play typically follow this order: head-to-head, point differential (capped per game, e.g. ±21), points scored, points allowed, coin toss. Verify with the specific tournament rules.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'substitutions_v2',
 'Flag 7v7 — Substitutions',
 'Free substitution between plays. Players must clear the field before the snap; substituting after the ball is set draws an illegal-substitution penalty (5 yards, replay the down).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'equipment',
 'Flag 7v7 — Equipment requirements',
 'Standard flag belt with two flags (some leagues use three). Mouthguards required in many sanctioned events. Soft cleats only — no metal. Jewelry and hard hair beads must be removed. Helmets and pads are NOT worn in 7v7.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'flag_pull_legality',
 'Flag 7v7 — Legal flag pull',
 'A defender ends a play by pulling either flag from the ball carrier''s belt. Wrapping the runner, holding, pushing, or grabbing anything other than the flag is a penalty even if the flag comes off as a result.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'spot_of_ball',
 'Flag 7v7 — Spot of the ball',
 'The ball is spotted where the flag is pulled (not where the runner''s feet are). Out-of-bounds spot is where the runner''s body crosses the sideline. Incompletions return to the previous spot.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'no_blocking',
 'Flag 7v7 — No blocking',
 'Like 5v5 flag, blocking is illegal. No screens, no picks, no contact-based attempts to obstruct defenders. Incidental contact is judged by the official; deliberate contact is a penalty.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'flag_belt_visible',
 'Flag 7v7 — Flag belt visibility',
 'Flag belts must be worn over the jersey with both flags clearly visible at all times. Tucking the jersey over the flag belt is illegal equipment — 5 yards plus loss of down (if discovered after a play).',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'officials_v2',
 'Flag 7v7 — Officiating crew',
 'A typical 7v7 crew is two officials: a referee behind the QB managing the count and the snap, and a downfield judge ruling on completions, OOB, and pass interference. No instant-replay review.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'forfeit_v2',
 'Flag 7v7 — Forfeit',
 'A team that cannot field the minimum required number of players (often 5 or 6) by official kickoff time forfeits. Forfeit scores commonly recorded as 14-0 or per league bylaws.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'sportsmanship',
 'Flag 7v7 — Sportsmanship rules',
 'Taunting, trash talk, and excessive celebration draw an unsportsmanlike-conduct penalty (10 yards, automatic first down on defense). Two unsportsmanlike fouls on the same player = ejection. Coaches may also be assessed sideline penalties.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'rules', 'mercy',
 'Flag 7v7 — Mercy rule',
 'Many 7v7 leagues invoke a mercy rule when one team leads by 28+ in the second half: the clock runs continuously. Some leagues end the game at a higher margin (35-40+).',
 'flag_7v7', null, 'seed', null, false, true);

-- Initial revisions for new rows.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed v2 expansion (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_7v7'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
