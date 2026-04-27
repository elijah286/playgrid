-- Coach AI KB — Universal offensive strategy principles (sport_variant=NULL).
-- Concepts that apply to every variant — game-planning, leverage, tempo,
-- situational play-calling, halftime adjustments, scouting reports.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Game planning fundamentals ───────────────────────────────────
('global', null, 'tactics', 'gameplan_self_scout',
 'Strategy: Self-scout',
 'Every 3-4 weeks, audit your own tendencies. By formation, down, distance, field zone, and personnel — what % run vs pass? Defenses chart this. Find your top 2 tendencies and break them with a tagged play in your next game plan. Predictability loses.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'gameplan_opp_scout',
 'Strategy: Opponent scouting',
 'For each opponent: identify their base front, base coverage, blitz tendencies (which downs/distances), how they handle motion, how they handle trips/empty, and their three best defenders. Build the game plan around what stresses them most.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'gameplan_install_week',
 'Strategy: Weekly install rhythm',
 'Mon: install game-plan plays for the week (5-8 new tags or wrinkles, never a wholesale change). Tue-Wed: rep them at full speed. Thu: situational + walk-through. Fri: mental reps + pre-game. Saturday: execute. Repetition by Wednesday is the predictor of game-day execution.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'gameplan_personnel_match',
 'Strategy: Personnel-driven game plan',
 'Build the game plan around your personnel, not a scheme ideal. If your QB throws 8-yard digs better than 30-yard verticals, design around digs. If your best player is a slot WR vs nickel matchups, hunt that match. Ideal scheme < executed scheme.',
 null, null, 'seed', null, true, false),

-- ── Leverage and matchup ────────────────────────────────────────
('global', null, 'tactics', 'leverage_attack',
 'Strategy: Attack defender leverage',
 'Every defender has leverage (inside or outside). Attack the side they''re NOT leveraged toward. Inside leverage = throw outside (out, fade); outside leverage = throw inside (slant, dig). Pre-snap leverage is the easiest read in football.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'matchup_isolation',
 'Strategy: Matchup isolation',
 'Identify your best WR vs their worst defender. Use formation/motion to isolate that matchup (empty backfield, trips with #1 backside, motion to align the two). Then attack — and keep attacking until they adjust.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'numbers_advantage',
 'Strategy: Numbers advantage',
 'Count defenders in the box vs your blockers. Light box (5 or fewer vs 6 blockers) = run all day. Heavy box (7+ vs 5 blockers) = throw the perimeter or RPO. Pre-snap math wins — never run into a stacked box without an answer.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'identify_coverage',
 'Strategy: Identifying coverage pre-snap',
 'Two safeties high = Cover 2 / Cover 4. One safety high = Cover 1 / Cover 3. Corners pressed up = man or Cover 2. Corners deep off = Cover 3 / Quarters. Use motion to confirm — defenders shift with motion in man, hold spots in zone. Train the QB to declare a coverage every snap.',
 null, null, 'seed', null, true, false),

-- ── Motion and formation ────────────────────────────────────────
('global', null, 'tactics', 'motion_as_info',
 'Strategy: Motion as information',
 'Motion does two things: it gives you free pre-snap info on coverage (defender chases = man; defender stays = zone), and it changes your formation strength. Use early in the game to establish what coverage they''re playing, then exploit it.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'motion_as_weapon',
 'Strategy: Motion as a weapon',
 'Beyond info, motion creates: (1) jet/sweep run threats, (2) overload formations the defense can''t adjust to in time, (3) free releases (motion player gets a head start), (4) altered alignments that confuse zone defenders. Modern offenses motion 40-60% of snaps.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'formation_strength',
 'Strategy: Formation strength',
 'Strong-side = side with more eligibles or the TE. Defense aligns based on strength — a strong call can shift coverage. Use unbalanced formations (trips, bunch) to overload one side and expose the other.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'empty_formation',
 'Strategy: Empty backfield',
 '5-wide (no RB in backfield). Forces the defense to declare coverage; spreads them across the field. Vulnerable to interior pressure since there''s no chip help. Use sparingly — 2-3x per game in clear passing situations.',
 null, null, 'seed', null, true, false),

-- ── Down-and-distance philosophy ────────────────────────────────
('global', null, 'tactics', 'first_down_philosophy',
 'Strategy: 1st down philosophy',
 'Goal: gain 4+ yards to stay on schedule (2nd-and-6 or better). 50-55% run rate is healthy. Consider a 1st-down shot play — defenses are often softest here. Avoid negative-yard plays at all costs (sacks, TFLs).',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'second_down_philosophy',
 'Strategy: 2nd down philosophy',
 '2nd-and-medium (3-7): balanced; 50/50 run-pass. 2nd-and-long (8+): play-action and shot plays — defense expects pass, exploit it. 2nd-and-short (1-2): take a shot or run downhill — easy 3rd down to fall back on.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'third_down_philosophy',
 'Strategy: 3rd down philosophy',
 '3rd-and-short (1-2): power, sneak, or quick game (slant/stick). 3rd-and-medium (3-6): mesh, stick, curl-flat — find the sticks. 3rd-and-long (7+): max protect, shot play, or screen vs blitz. Convert at all costs — sustaining drives wins games.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'fourth_down_modern',
 'Strategy: 4th down modern analytics',
 'Aggressive teams convert more games than they lose to bad stops. Go for it on 4th-and-3 or shorter from the 50+. Consider 4th-and-short from your own 40+. In youth/HS, conservatism is more common — but modern data favors going for it more than coaches do.',
 null, null, 'seed', null, true, false),

-- ── Field position philosophy ───────────────────────────────────
('global', null, 'tactics', 'backed_up_philosophy',
 'Strategy: Backed up (own 1-15)',
 'Priority: get out of the shadow of the goal posts. Run 2-3 conservative plays before any complicated pass. Avoid negative-yard risk plays. A safety is a 2-point swing AND a free kick — devastating.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'red_zone_philosophy',
 'Strategy: Red zone offense',
 'Field shrinks: deep verticals lose. Best red zone calls: fade, slant/flat package, power run, RPO bubble, pick concept inside the 5. Stay aggressive — TDs are worth 7, FGs are worth 3, math favors going for it.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'goal_line_philosophy',
 'Strategy: Goal-line offense (inside 5)',
 'Power, dive, sneak, fade to back-shoulder. Defenders are stacked — leverage formation (jumbo + extra TE) and physicality. Save trick plays for unexpected 1st-and-goal, not 4th-and-1.',
 null, null, 'seed', null, true, false),

-- ── Clock and tempo ─────────────────────────────────────────────
('global', null, 'tactics', 'tempo_three_speeds',
 'Strategy: Three tempos',
 'Huddle (slow, ~25 sec/play): conserves energy, controls clock with lead. No-huddle (medium, ~15 sec): standard pace, prevents substitution. Hurry-up (fast, ~10 sec or less): wears down defense, exploits confusion. Mix all three to control game rhythm.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'tempo_after_chunk',
 'Strategy: Snap fast after a chunk play',
 'After a 15+ yard play, snap the next play quickly — the defense is still adjusting/communicating, often confused. The next snap is often the best play of the drive.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'two_minute_drill_phil',
 'Strategy: Two-minute drill',
 'Sideline routes (out, comeback, sail) to stop the clock. Spike to reset if needed. Convert at all costs — a punt with 30 sec left almost certainly ends the half. Practice this weekly under simulated pressure.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'kill_clock_phil',
 'Strategy: Killing clock with the lead',
 'Run the ball, take long handoffs, stay in bounds. Run the play clock down to 1-2 sec before snap. Avoid passing — incompletion stops the clock. A 4-min drill that ends in a punt is usually a win.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'comeback_mode_phil',
 'Strategy: Trailing late, no-huddle',
 'No-huddle, sidelines, prefer routes that come back to QB (curl, comeback) over deep posts/digs. Use timeouts after defensive 1st downs to preserve clock. Don''t panic in 1st half — execute base offense.',
 null, null, 'seed', null, true, false),

-- ── In-game adjustments ────────────────────────────────────────
('global', null, 'tactics', 'scripting_first_15',
 'Strategy: Scripting the first 15',
 'Pre-plan your first 15 plays. Probe with run, play-action, and base concepts to see how the defense aligns and reacts. After the script, build the rest of the game plan around what worked. Bill Walsh popularized this — it''s now standard.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'halftime_adjustments',
 'Strategy: Halftime adjustments',
 'Identify what''s working, what''s not, and what they''re trying to take away. Talk to the OL first — they know what''s happening at the LOS. Make 2-3 specific changes (tag, blocking adjustment, motion) — not a wholesale rewrite.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'series_planning',
 'Strategy: Series planning (3-play call sheet)',
 'Group calls by series — 3 plays designed to flow together. E.g., (1) inside zone, (2) play-action off the same look, (3) reverse off the play-action fake. Defense reacts to play 1 by over-committing to play 3.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'tendency_break',
 'Strategy: Breaking tendencies',
 'Defenses chart your run/pass splits by formation, down, and field position. Avoid being predictable — call a pass on 2nd-and-1, a run on 3rd-and-7, or run from your empty formation. Save the tendency-breaker for a critical situation.',
 null, null, 'seed', null, true, false),

-- ── Vs specific defensive looks ────────────────────────────────
('global', null, 'tactics', 'vs_press_strat',
 'Strategy: Beating press coverage',
 'Use stacks and bunches for free release. Run mesh, slants, and double moves (sluggo, hitch-and-go). Get your best WR isolated 1-on-1 vs a CB you can win against. Quick game punishes press.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_off_strat',
 'Strategy: Beating off coverage',
 'Hitches, quick outs, and now screens punish soft cushions. Force the corner to drive forward, then take a shot deep on the next play (out-and-up, hitch-and-go).',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_cover_2_strat',
 'Strategy: Beating Cover 2',
 'Attack the seams (4 verts), throw deep between safeties, run smash to attack the corner-flat triangle. Mesh and dig also exploit the soft middle. The seam is the kill shot.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_cover_3_strat',
 'Strategy: Beating Cover 3',
 'Run flood/sail to overload the curl-flat defender. Hit deep crossers behind the underneath zones. Smash struggles vs Cover 3 — switch to flat-corner combos to one side and a vertical/dig to the other. The flat is wide open in zone.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_quarters_strat',
 'Strategy: Beating Quarters',
 'Quarters defenders pattern-match deep — the underneath windows are wide open. Run mesh, levels, drives, quick game. Inside zone with RPO glance also wins because the safety pulls in on the run.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_blitz_strat',
 'Strategy: Beating the blitz',
 'Quick game (slants, hitches), screens (RB or WR), max protect with shots. Hot routes — receivers convert to slants/sit-downs vs man pressure. Slide protection toward the pressure side. Most blitzes give up something underneath.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_cover_0_strat',
 'Strategy: Beating Cover 0',
 'No safety help = your best WR is 1-on-1. Take a shot deep. Or use a quick slant/now to beat the rush before pressure. Trick: max protect + 1-WR fade = highest-percentage shot.',
 null, null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_zone_blitz_strat',
 'Strategy: Beating zone blitz',
 'Zone blitzes drop a DL into a short zone — typically the hot read for slants. Adjust hots: hit the second-window (sit route at 8-10 yards) instead of the slant. Max-protect tight ends help.',
 null, null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — universal offensive strategy principles', null
from public.rag_documents d
where d.sport_variant is null and d.topic = 'tactics'
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
