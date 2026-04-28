-- Coach AI KB — Variant-specific practice templates.
-- These are markdown-shaped sample plans Cal can retrieve and adapt when a
-- coach asks for a practice plan. Each template covers a typical session for
-- a specific variant + age tier.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ FLAG 5v5 TEMPLATES ============

('global', null, 'practice_template', 'sample_5v5_youth_60min',
 'Sample 5v5 youth practice (60 min, tier-1)',
 'Goal: First-year players, install + fun.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:08 | Warm-up: sharks-and-minnows | Active warm-up + flag-pull reps |
| 0:08-0:18 | Station 1: Catching wall (5 min) → Station 2: Flag-pull form (5 min) | Fundamentals, parallel stations |
| 0:18-0:28 | Route tree introduction (hitch, slant, out at 5 yds) | Routes vs cones, no defense |
| 0:28-0:48 | 5-on-5 scrimmage (2x 8-min halves with 2-min rest) | Live game reps |
| 0:48-0:55 | Relay race (catch-pull-handoff loop) | Conditioning + fun |
| 0:55-1:00 | Team talk: 1 teaching point + 1 piece of praise + parent reminder | Culture |',
 'flag_5v5', null, 'seed', null,
 'tier1_5_8', false, true),

('global', null, 'practice_template', 'sample_5v5_competitive_75min',
 'Sample 5v5 competitive practice (75 min, tier-2/3)',
 'Goal: Competitive flag league, install + situational.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:10 | Dynamic warm-up + flag-pull form | Movement prep |
| 0:10-0:25 | Position group splits — QB+WR (routes), RB (ball security), DEF (zone drops) | Parallel fundamentals |
| 0:25-0:40 | 5-on-air install (run 8-10 plays from script) | Timing without defense |
| 0:40-0:60 | 5v5 live (3 series each side) | Scrimmage |
| 0:60-0:70 | Red zone period (5 plays from the 10) | Situational |
| 0:70-0:75 | Team talk + scout for next opponent | Culture |',
 'flag_5v5', null, 'seed', null,
 'tier3_12_14', false, true),

-- ============ FLAG 7v7 TEMPLATES ============

('global', null, 'practice_template', 'sample_7v7_offseason_90min',
 'Sample 7v7 offseason practice (90 min, tier-4)',
 'Goal: Offseason 7v7 (HS team running 7v7 league for skill development).

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:12 | Warm-up + dynamic | Movement prep |
| 0:12-0:30 | Receivers vs DBs 1-on-1 | Release + coverage |
| 0:30-0:45 | Routes-on-air (4 concepts: stick, mesh, smash, 4-verts) | Concept timing |
| 0:45-1:10 | 7v7 live competition period (4-second clock) | Game tempo |
| 1:10-1:20 | 2-minute drill | Situational |
| 1:20-1:30 | Conditioning: 8x 40-yd sprints | Tier-4 conditioning |',
 'flag_7v7', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ FLAG 4v4 TEMPLATES ============

('global', null, 'practice_template', 'sample_4v4_tier1_60min',
 'Sample 4v4 first-year practice (60 min, tier-1)',
 'Goal: Ages 5-8, first season, every kid plays + has fun.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:08 | Sharks-and-minnows | Warm-up + flag-pull reps disguised |
| 0:08-0:15 | Catching circuit (3 stations, 2 min each) | Hands |
| 0:15-0:25 | Route running with cones (hitch + slant) | Routes |
| 0:25-0:50 | 4v4 mini-game (full-field scrimmage, every kid touches the ball) | Reps + fun |
| 0:50-0:57 | Relay race (catch + run + handoff) | Active finisher |
| 0:57-1:00 | Team talk: praise 3 specific kids | Culture |',
 'flag_4v4', null, 'seed', null,
 'tier1_5_8', false, true),

-- ============ TACKLE 11 TEMPLATES ============

('global', null, 'practice_template', 'sample_tackle_youth_90min',
 'Sample tackle 11 youth practice (90 min, tier-2)',
 'Goal: Pop Warner / AYF level, in-season Tuesday.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:12 | Warm-up + dynamic | Movement prep |
| 0:12-0:25 | Heads Up tackling form circuit (4 stations) | Safety fundamental |
| 0:25-0:45 | Position splits (parallel: skill = routes/cones; line = stance/start + drive blocks; defense = pursuit) | Position fundamentals |
| 0:45-1:00 | Inside run period (10 plays) | Run game |
| 1:00-1:15 | 7-on-7 (skel pass, 8 plays) | Pass game |
| 1:15-1:25 | Team period (12 plays full O vs full D) | Game install |
| 1:25-1:30 | Team talk + scout for next opponent | Culture |',
 'tackle_11', null, 'seed', null,
 'tier2_9_11', false, true),

('global', null, 'practice_template', 'sample_tackle_hs_in_season_120min',
 'Sample tackle 11 HS in-season Tuesday (120 min)',
 'Goal: Heavy install + situational. Pads on.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:15 | Dynamic warm-up + position-specific movement prep | Movement prep |
| 0:15-0:35 | Individual position fundamentals (drills tied to game plan) | Tech |
| 0:35-0:55 | Group periods: Inside Run / 7-on-7 / Pass Pro on rotating fields | Group install |
| 0:55-1:30 | Team install vs scout D — 25-30 scripted plays, 3rd down emphasis | Game install |
| 1:30-1:45 | Special teams (one phase) | ST |
| 1:45-1:55 | Conditioning (position-specific) | Tier-4 conditioning |
| 1:55-2:00 | Team meeting + scouting card hand-off | Logistics |',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'practice_template', 'sample_tackle_hs_walkthrough_70min',
 'Sample tackle 11 HS Thursday walkthrough (70 min)',
 'Goal: Pads OFF. Mental reps, not physical.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:08 | Light warm-up (no dynamic series, save legs) | Warm-up |
| 0:08-0:23 | Offense walkthrough vs scout cards (every formation + every play) | Mental reps |
| 0:23-0:38 | Defense walkthrough (every front + coverage vs scout offense) | Mental reps |
| 0:38-0:53 | Special teams walkthrough (every phase, every alignment) | ST |
| 0:53-1:03 | Situations: 2-min, 4-min, end-of-half | Mental reps |
| 1:03-1:10 | Team meeting + travel logistics | Logistics |',
 'tackle_11', null, 'seed', null,
 'tier4_hs', false, true),

-- ============ 6-MAN / 8-MAN ============

('global', null, 'practice_template', 'sample_six_man_hs_practice',
 'Sample 6-man HS practice (105 min)',
 'Goal: 6-man tier-4 in-season, pass-heavy. Pads on.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:12 | Warm-up + dynamic | Movement prep |
| 0:12-0:25 | Open-field tackling circuit (everyone — 6-man defense lives in space) | Safety fundamental |
| 0:25-0:40 | QB drops + WR routes (vs air, 4 spread concepts) | Pass game |
| 0:40-0:55 | Lateral exchange + run-game install (sweeps, jets, QB counter) | 6-man-specific run |
| 0:55-1:15 | 6-on-6 live competition period | Scrimmage |
| 1:15-1:25 | Special teams (kickoff/return — 6-man kicks count differently) | ST |
| 1:25-1:35 | Conditioning: 12x 30-yd sprints | Conditioning |
| 1:35-1:45 | Team talk | Culture |',
 'six_man', null, 'seed', null,
 'tier4_hs', false, true),

('global', null, 'practice_template', 'sample_eight_man_hs_practice',
 'Sample 8-man HS practice (110 min)',
 'Goal: 8-man tier-4 in-season. Pads on.

| Time | Activity | Focus |
|------|----------|-------|
| 0:00-0:12 | Warm-up + dynamic | Movement prep |
| 0:12-0:30 | Heads Up tackling + pursuit | Safety fundamental |
| 0:30-0:50 | Position groups (parallel: skill routes; line drive blocks/pulls; defense keys) | Tech |
| 0:50-1:10 | Inside run period (10 plays) | Run game |
| 1:10-1:25 | 8-on-8 pass skel | Pass game |
| 1:25-1:40 | Full team (12 plays O vs D) | Game install |
| 1:40-1:50 | Special teams (one phase) | ST |
| 1:50-1:55 | Team talk | Culture |',
 'eight_man', null, 'seed', null,
 'tier4_hs', false, true);
