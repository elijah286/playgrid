-- Coach AI KB — NFL Flag 5v5 coaching techniques.
--
-- Practice structure, teaching progressions, age-appropriate drills, and
-- game-management craft. Aimed at youth and recreational coaches.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ── Practice structure ───────────────────────────────────────────
('global', null, 'tactics', 'practice_structure',
 'NFL Flag 5v5 — Coaching: Practice structure',
 'A 60-minute practice template: 10 min dynamic warm-up + flag pulling, 10 min individual position skills (QB throws / receiver routes / defender coverage drops), 15 min group install (one new offensive concept + one defensive call), 15 min 5-on-5 team period running the install, 10 min scrimmage / situational. End on a positive rep — never on a mistake.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'practice_first_week',
 'NFL Flag 5v5 — Coaching: First week of practice',
 'Don''t install the playbook yet. Spend week 1 on: pulling flags (most kids do it wrong — go for the flag, not the body), proper route stems (sharp cuts, not rounded), QB grip and 3-step drop, pre-snap alignment. A team that pulls flags well and lines up correctly will beat a team running fancy plays.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'practice_install_pacing',
 'NFL Flag 5v5 — Coaching: Install pacing',
 'Younger divisions (5-8): 3-4 plays total per game, run them all season — repetition wins. Older divisions (9-12): add one new play per week, never more than 8-10 in the active game plan. Ages 13+: can handle 12-15 plays plus situational packages.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Teaching ──────────────────────────────────────────────────────
('global', null, 'tactics', 'teach_flag_pull',
 'NFL Flag 5v5 — Coaching: Teaching flag pulls',
 'The single most valuable defensive skill. Teach the "stop and pull" — break down (small, choppy steps) before contact, focus eyes on the flag (not the runner''s face), and grab with both hands if needed. Most missed pulls are because the defender lunges at the body. Drill: 1-on-1 corner runs where the defender must mirror and pull without grabbing the runner.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'teach_routes',
 'NFL Flag 5v5 — Coaching: Teaching routes',
 'Three things make routes work: depth (count steps, don''t guess), sharp cuts (plant the outside foot, drive off it — no rounded turns), and eyes back on the QB the moment the cut is complete. Drill: route stems on a yard-marked field; the receiver calls out the depth at every cut.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'teach_qb_drop',
 'NFL Flag 5v5 — Coaching: Teaching QB footwork',
 'In 5v5 the QB has 7 seconds and no offensive line. Three drops to teach: the 1-step (slant, hitch, screen), the 3-step (mesh, levels, smash), and the 5-step (4 verts, deeper concepts). The drop tempo should match the route depth — a 5-step drop on a slant arrives late.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'teach_qb_reads',
 'NFL Flag 5v5 — Coaching: Teaching pre-snap reads',
 'Teach the QB to count safeties before the snap: one deep safety = single-high (Cover 1 or 3), two deep safeties = two-high (Cover 2 or 4). Single-high beats with seam routes and verts; two-high beats with smash and curl-flat. Even a 9-year-old can learn "1 safety = throw deep middle, 2 safeties = throw underneath."',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'teach_motion',
 'NFL Flag 5v5 — Coaching: Teaching motion timing',
 'Motion player must reach top speed AT THE SNAP, not before. Practice the cadence: motion starts on "set", snap goes on the count where the motion player is at the desired spot. Rush motion = false start. Have the QB count motion steps out loud during install.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'teach_zone_drops',
 'NFL Flag 5v5 — Coaching: Teaching zone defense',
 'Zone drops are about LANDMARKS, not mirroring receivers. Each defender drops to a spot (e.g. flat = 5 yards deep, 3 yards inside the sideline) and reads the QB''s eyes from there. Drill: spot the defenders, run a 7-on-air walkthrough where they drop to landmark and break only when the QB throws.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'teach_man_technique',
 'NFL Flag 5v5 — Coaching: Teaching man coverage',
 'Man defenders should align with inside leverage (one shoulder over the receiver''s inside shoulder), open their hips to the receiver''s release, and stay 1-2 steps off until the receiver makes a cut. Eyes on the receiver''s belt, not their head — the belt tells you where they''re actually going.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Game day ─────────────────────────────────────────────────────
('global', null, 'tactics', 'gameday_script',
 'NFL Flag 5v5 — Coaching: Game-day call sheet',
 'Bring a printed call sheet organized by situation: 1st down (3 plays), 2nd-and-medium (3), 3rd-and-short (2), 3rd-and-long (2), red zone (3), backed-up (2), 2-minute (3), trick (1). Coaches who script live in the moment are guessing — coaches who script ahead of time pick from a menu.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'gameday_subs',
 'NFL Flag 5v5 — Coaching: Substitution patterns',
 'Rotate every 2-3 series in recreational play to keep kids fresh and equitable. In competitive divisions, build "personnel groups" — keep your fastest 3 in for two-minute, your most reliable hands in for 3rd down. Always tell players what triggers the rotation so they know when their next rep is coming.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'gameday_communication',
 'NFL Flag 5v5 — Coaching: Communicating with young players',
 'Use one-sentence reminders, not paragraphs. "Eyes on the flag." "Sharp cut on the slant." "Count the safeties." Kids tune out long monologues. Praise specific actions ("great cut", "good drop") rather than generic ("nice play"). After a mistake, tell them what to do next time, not what they did wrong.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Drills ──────────────────────────────────────────────────────
('global', null, 'tactics', 'drill_1on1',
 'NFL Flag 5v5 — Coaching: 1-on-1 release drill',
 'One receiver vs one defender, 10-yard box. Receiver runs any route from a designated tree (slant/out/hitch/fade); defender plays man. Best for teaching release moves, route precision, and defender footwork. Run 3-4 reps per pairing, then rotate.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'drill_3on3',
 'NFL Flag 5v5 — Coaching: 3-on-3 perimeter drill',
 'Three receivers vs three defenders on one side of the field. QB throws. Teaches reading 2-on-2 and 3-on-3 spacing concepts in isolation before adding the full team. Great for installing snag, smash, stick.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'drill_situational',
 'NFL Flag 5v5 — Coaching: Situational scrimmage',
 'End every practice with 5 minutes of game-situation reps: "3rd-and-7 from your own 30, 90 seconds left, down by 5 — go." Players get used to the urgency before game day. Cycle through 4-5 situations per week so every scenario gets reps.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — coaching techniques (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_5v5'
  and d.sanctioning_body = 'nfl_flag'
  and d.source = 'seed'
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
