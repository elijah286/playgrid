-- Coach AI KB — Drills for Flag 4v4.
-- 4-on-4 flag, smaller field (often 30x30 or 40x20), shorter games. Common
-- in young recreational leagues and as a transitional format. Tight space
-- = less time, every player a primary read. No blocking, often no rush.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

('global', null, 'drill', 'flag_4v4_principles',
 '4v4 coaching principles',
 '4v4 is the most-introductory format. With only 4 players per side: every player must be ready to be a primary target every play. Field is small (~30x30 or 40x20 yds), so deep routes top out at 10 yds. Routes are short, decisions are fast, every kid touches the ball multiple times per game. 4v4 is mostly a tier-1/tier-2 format; rarely competitive at HS+.',
 'flag_4v4', null, 'seed', 'NFL FLAG 4v4 / I9 sports rule sets',
 null, false, true),

('global', null, 'drill', 'flag_4v4_core_routes',
 '4v4 core route tree',
 'Limit route tree to 5 routes: hitch (3), slant (3), out (4), corner (6 break to corner cone), go (vertical full field). All depths short — total field is ~30 yds. Drill all 5 with cones at the LOS as start and depth markers. 8-10 reps per route in 5-min block.',
 'flag_4v4', null, 'seed', null,
 'tier1_5_8', false, true),

('global', null, 'drill', 'flag_4v4_qb_quick_decision',
 'QB 1-read drill',
 'Setup: QB in shotgun, 3 WRs running quick routes (e.g., all hitches at 4 yds). Coach calls one number pre-snap.
Reps: QB throws to the called WR. 12 throws.
Coaching points: in 4v4 the QB has 2-3 seconds, no progressions — just identify and throw. Drill confidence on the called read: throw it, don''t hesitate. Hesitation = sack/INT.',
 'flag_4v4', null, 'seed', null,
 'tier1_5_8', false, true),

('global', null, 'drill', 'flag_4v4_man_to_man',
 'Man-to-man defense fundamentals',
 'Setup: 4 WRs vs 4 DBs, all in man coverage. QB releases ball after 3 sec.
Reps: 6 reps with varied routes.
Coaching points: 4v4 defense is mostly man — 4 receivers means zone leaves a man uncovered. Each DB MUST stay with his guy through any rub or motion. Drill switch calls: "Switch!" = trade WRs on a crossing route.',
 'flag_4v4', null, 'seed', null,
 'tier2_9_11', false, true),

('global', null, 'drill', 'flag_4v4_box_competition',
 '4v4 box competition (full game tempo)',
 'Setup: 30x30 yard field. 3 downs to make midfield, 3 more to score. Full game-tempo scrimmage.
Reps: 4-6 series per side, swap O/D.
Coaching points: 4v4''s small field means EVERY rep is meaningful. Run it as the bulk of practice (20-25 min) — kids learn by playing. Track: TD %, INT %, drops. Adjust the next practice based on what''s breaking.',
 'flag_4v4', null, 'seed', null,
 null, false, true),

('global', null, 'drill', 'flag_4v4_tier1_format',
 'Tier-1 (5-8) 4v4 practice format',
 '60-min practice for 5-8 year olds in 4v4:
- 0:00-0:10 — Warm-up game (sharks-and-minnows)
- 0:10-0:25 — 3 stations rotating: catching, flag-pulling form, route running with cones (5 min each)
- 0:25-0:45 — Scrimmage 4v4 (tons of reps)
- 0:45-0:55 — Relay or fun finisher
- 0:55-1:00 — Team talk
Total time on the field ≈ 80% playing/active. Active-time ratio matters more than skill perfection at this age.',
 'flag_4v4', null, 'seed', null,
 'tier1_5_8', false, true),

('global', null, 'drill', 'flag_4v4_no_qb_protector',
 'No-blocking handoff/run drill',
 'Setup: in 4v4 with run allowed (some leagues), QB hands off to RB. Defenders tag with flag.
Reps: 6 reps — practice WR perimeter leverage AND the handoff exchange.
Coaching points: the handoff in 4v4 happens fast — no fullback or OL to slow defenders. RB takes a clean inside path, hits the seam, no dancing. WR''s "block" by leveraging the corner.',
 'flag_4v4', null, 'seed', null,
 'tier2_9_11', false, true),

('global', null, 'drill', 'flag_4v4_2_minute_mini',
 'Mini 2-minute drill (4v4)',
 'Setup: ball at own 10. Need to score in 2:00. No huddle.
Reps: 1-2 drives per practice.
Coaching points: 4v4 fields are short (often 40 yds total) so a 2-min drill is REALLY a 1-min drill. Tempo matters: hustle to LOS, QB calls fast, snap. End-state: score or fail.',
 'flag_4v4', null, 'seed', null,
 'tier2_9_11', false, true),

('global', null, 'drill', 'flag_4v4_developmental_vs_5v5',
 'Bridging 4v4 to 5v5',
 'Tier-2 teams transitioning from 4v4 to 5v5: the biggest jump is the addition of a center/RB position with a snap exchange. Drill the snap (under center or shotgun) for 2 weeks before live 5v5 reps. Add a basic run play with the center hand-off — kids need to know that running is possible with 5 players.',
 'flag_4v4', null, 'seed', null,
 'tier2_9_11', false, true);
