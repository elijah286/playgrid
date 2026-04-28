-- Coach AI KB — Drills for 6-man and 8-man tackle football.
-- Played in small schools, mostly West Texas / rural plains states.
-- 6-man: every player eligible to receive a pass; smaller field; modified
-- scoring (PAT kick = 2, PAT run/pass = 1).
-- 8-man: closer to 11-man but compressed field, fewer linemen.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ 6-MAN ============

('global', null, 'drill', 'six_man_principles',
 '6-man football coaching principles',
 '6-man differs in 4 key ways: (1) field is 80x40 yds (40 yd width compressed); (2) 15 yds for a 1st down (not 10); (3) ball must travel 1 yd backward or be touched by 2 players before crossing the LOS on a run play (the "lateral rule"); (4) all 6 players eligible to receive passes — including the OL.
Result: pass-heavy, perimeter-heavy, big plays + big swings. Defense must cover everyone, not just WRs. Coaching emphasis: tackling in space, conditioning (more open-field running), and creative offensive schemes.',
 'six_man', null, 'seed', 'NFHS 6-man rules / Texas 6-man tradition',
 'tier4_hs', false, true),

('global', null, 'drill', 'six_man_lateral_drill',
 'Lateral exchange drill (6-man)',
 'Setup: QB + RB + 1 receiver. QB takes snap, hands or pitches to RB, RB throws or laterals forward.
Reps: 8 reps mixing direct run (allowed if ball goes backward first) and lateral pitch.
Coaching points: train the legal sequence — every "run" play in 6-man involves a backward exchange first or a 2nd touch. RB must catch cleanly, set feet, throw. Lateral exchanges should be flat or slightly back; refs flag forward laterals as illegal.',
 'six_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'six_man_spread_concepts',
 '6-man spread offense concepts',
 'Most 6-man teams run spread looks. Common formations:
- TRIPS — 3 receivers one side, QB, center, single back. Use bubble screen + vertical combo.
- DOUBLES — 2 receivers each side. Mesh, smash, 4-verts.
- EMPTY — 5 receivers spread, QB alone. Pre-snap motion to identify coverage.
The compressed field favors quick game and screens. Best 6-man teams complete 70%+ of passes — they run boxed-in concepts that maximize YAC.',
 'six_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'six_man_open_field_tackle',
 'Open-field tackle drill (6-man)',
 'Setup: ballcarrier in 10x15 yd box, 1 tackler.
Reps: 8 reps.
Coaching points: 6-man is open-field football. Every defensive play has a 1-on-1 tackle in space. Heads Up form, eyes on hips, force the runner to commit. Drill 10 min daily — bad open-field tackling = 60-yard TDs every game.',
 'six_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'six_man_conditioning',
 '6-man conditioning emphasis',
 '6-man players run more than 11-man — every play involves perimeter movement, every drive can go 60+ yds. Conditioning emphasis: high-volume sprints (20-40 yds), 12-15 reps per session vs 8-10 in 11-man. Add "perfect-play" finishers running a full-field score (80 yd offensive series at game tempo). Aerobic base matters more than max strength.',
 'six_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'six_man_scoring_kick_strategy',
 '6-man PAT decision logic',
 'In 6-man, PAT kick = 2 points, PAT run/pass = 1 point. Reverse from 11-man. Decision logic:
- KICK if you have a reliable kicker (varies wildly at HS small-school level).
- RUN/PASS if down by 8 (need 2 + the TD = tied), or kicker is unreliable.
- Most 6-man teams run/pass by default because they don''t carry a dedicated kicker.
Print a 2-pt-equivalent chart for the sideline; logic is mirrored from 11-man.',
 'six_man', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ 8-MAN ============

('global', null, 'drill', 'eight_man_principles',
 '8-man football coaching principles',
 '8-man is the bridge between 6-man and 11-man. Field is 80x40 yds, 10 yds for first down (some leagues 15). Typical alignment: 2 OL or 3 OL, QB, 2 RBs, 2-3 WRs, vs 3 DL, 2 LBs, 3 DBs. Run game still works (unlike 6-man) but compressed field opens deep passes faster. Schemes look like a smaller 11-man.',
 'eight_man', null, 'seed', 'NFHS 8-man rules',
 'tier4_hs', false, true),

('global', null, 'drill', 'eight_man_run_concepts',
 '8-man run concepts',
 'With 2-3 OL, run game options are limited but real. Best concepts:
- INSIDE ZONE — 3 OL + 2 TE/H-back combo blocks, RB reads the bubble.
- POWER — pull a guard around to lead.
- JET SWEEP / TOSS — perimeter speed, common in 8-man.
- QB COUNTER — most teams have a running QB; great call vs spread defenses.
Drill: inside run period 2x/week with full O vs full D.',
 'eight_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'eight_man_pass_concepts',
 '8-man pass concepts',
 'Pass game looks like 11-man with one fewer OL. Main difference: protection is shorter (not enough OL for 5-step drops vs 4-man rush). Stick to:
- QUICK GAME — slants, hitches, quick outs (3-step drop).
- PLAY ACTION — strongest tool, sells the run.
- ROLLOUT / BOOT — gets QB out of trouble when protection breaks.
Avoid drop-back 7-step passes; you''ll get killed.',
 'eight_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'eight_man_defense',
 '8-man defense fundamentals',
 'Common front: 3-2-3 (3 DL, 2 LB, 3 DB) or 5-3 (5 DL, 3 LB) for run-heavy opponents. Coverages: cover 3, cover 1 (man-free), cover 0 blitz on 3rd-and-long.
With only 3 DBs, deep passes are the biggest threat — drill safety play and angle tackles weekly.',
 'eight_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'drill', 'eight_man_six_man_open_field',
 'Open-field tackling (6/8-man)',
 'Setup: 1 tackler vs 1 ballcarrier in a 10x15 box.
Reps: 8 reps.
Coaching points: same as 11-man Heads Up form, but 6-man and 8-man have MORE open-field tackles per game than 11-man. Drill it 2x as much. Form > finish — don''t worry about driving them down at first; just BREAKDOWN, WRAP, FALL.',
 'eight_man', null, 'seed', null,
 'tier4_hs', false, true);
