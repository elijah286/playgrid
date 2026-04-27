-- Coach AI KB — Tackle 11-man strategy and tactics (shared, sanctioning_body=NULL).
-- Universal across Pop Warner, AYF, NFHS.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Down-and-distance ────────────────────────────────────────────
('global', null, 'tactics', 'first_down',
 'Tackle 11 — Strategy: 1st down play-calling',
 'Goal on 1st-and-10: gain 4+ yards to stay on schedule. Run-heavy on early downs vs lighter boxes; play-action when the defense crowds the box. 50-55% run rate is a healthy baseline at every level.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'second_down',
 'Tackle 11 — Strategy: 2nd down play-calling',
 '2nd-and-medium (4-7): balance run/pass, attack between the hashes. 2nd-and-long (8+): play-action and shot plays — defense expects pass and you can use that. 2nd-and-short (1-3): run downhill or take a deep shot — easy 3rd down to fall back on.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'third_down',
 'Tackle 11 — Strategy: 3rd down play-calling',
 '3rd-and-short (1-3): power run, sneak, or quick slant. 3rd-and-medium (4-6): mesh, stick, or curl-flat — find the sticks. 3rd-and-long (7+): max protect, isolate the best WR, or screen if defense brings 6+. Keep the chains moving, even if it''s a check-down.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'fourth_down',
 'Tackle 11 — Strategy: 4th down decisions',
 'Modern analytics: go for it on 4th-and-3 or less from your own 40+. In youth football, conservatism is the norm — punt outside FG range. In all levels, scout your kicker''s reliable range before deciding 4th-down policy.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Field zones ──────────────────────────────────────────────────
('global', null, 'tactics', 'backed_up',
 'Tackle 11 — Strategy: Backed up (own 1-15)',
 'Priority is getting out of the shadow of the goal posts. Run downhill 2-3 plays to create breathing room before any play-action. Avoid plays with negative-yard risk (deep drops, screens). A safety is a 2-point swing.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'midfield',
 'Tackle 11 — Strategy: Midfield play-calling',
 'Most of your script lives between your own 25 and the opponent''s 30. Run base offense — install all your concepts here. Take shots when defense creeps up; chip away vs deep coverage.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'red_zone',
 'Tackle 11 — Strategy: Red zone offense (inside 20)',
 'Field shrinks: deep verticals lose. Best red zone calls: fade to your tallest WR, slant/flat package, power run, RPO bubble. Stay aggressive — 7 points beat 3 points by a lot, especially in close games.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'goal_line',
 'Tackle 11 — Strategy: Goal-line offense (inside 5)',
 'Power, dive, sneak, fade to the back-shoulder. Defenders are stacked — leverage formation (jumbo + extra TE) and physicality. Save trick plays for unexpected 1st-and-goal situations, not 4th-and-1.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Clock management ─────────────────────────────────────────────
('global', null, 'tactics', 'two_minute_drill',
 'Tackle 11 — Strategy: Two-minute drill',
 'Use sideline routes (out, comeback, sail) to stop the clock. Spike the ball if no timeouts and need to reset. Convert 1st downs at all costs — a punt with 30 seconds left likely ends the half. Practice this under pressure weekly.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'kill_clock',
 'Tackle 11 — Strategy: Killing the clock with the lead',
 'Run the ball, take long handoffs, stay in bounds. Run the play clock down to 1-2 seconds before snapping. Avoid passing — incompletion stops the clock. A 4-minute drill that ends in a punt is usually a win.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'comeback_mode',
 'Tackle 11 — Strategy: Trailing late, no-huddle',
 'Go no-huddle, work the sidelines, prefer routes that come back to the QB (not posts/digs). Use timeouts after defensive 1st downs to preserve clock for after a possession change. Don''t panic in the first half — execute.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Matchup adjustments ──────────────────────────────────────────
('global', null, 'tactics', 'vs_press_man',
 'Tackle 11 — Strategy: Beating press man',
 'Use stacks and bunches to give receivers a free release. Run mesh, slant/flat, and double-moves. Get your best WR isolated 1-on-1 to attack the matchup. Quick game punishes press.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_cover_2',
 'Tackle 11 — Strategy: Beating Cover 2',
 'Attack the seams (4 verts), throw deep between the safeties, run smash to attack the corner-flat triangle. Mesh and dig also exploit the soft middle.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_cover_3',
 'Tackle 11 — Strategy: Beating Cover 3',
 'Run flood and sail to overload the curl-flat defender. Hit deep crossers behind the underneath zones. Smash struggles vs Cover 3 — switch to flat-corner combos to one side and a vertical/dig combo to the other.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_quarters',
 'Tackle 11 — Strategy: Beating Quarters (Cover 4)',
 'Quarters defenders pattern-match deep routes — the underneath windows are wide open. Run mesh, levels, drives, and quick game. Inside zone with RPO glance also wins because the safety pulls in on the run.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_blitz',
 'Tackle 11 — Strategy: Beating the blitz',
 'Quick game (slants, hitches), screens (RB or WR), max protect with shots. Hot routes — receivers convert to slants/sit-downs vs man pressure. Slide protection toward the pressure side.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Tempo and game flow ──────────────────────────────────────────
('global', null, 'tactics', 'tempo',
 'Tackle 11 — Strategy: Using tempo',
 'Three speeds: huddle (slow), no-huddle (medium), hurry-up (fast). Mix tempo to prevent defense from substituting. Run a hot tempo after a chunk play to exploit a confused defense.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'scripting',
 'Tackle 11 — Strategy: Scripting the first 15',
 'Pre-plan your first 15 plays. Probe with run, play-action, and base concepts to see how the defense aligns and reacts. After the script, build the rest of the game plan around what worked. Walsh popularized this — it''s now standard.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'halftime_adjust',
 'Tackle 11 — Strategy: Halftime adjustments',
 'Identify what worked, what didn''t, and what the defense is trying to take away. Talk to linemen first — they know what''s happening at the LOS. Make 2-3 specific changes (formation tag, blocking adjustment, coverage call), not a wholesale rewrite.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'tendency_break',
 'Tackle 11 — Strategy: Breaking tendencies',
 'Defenses chart your run/pass splits by formation, down, and field position. Avoid being predictable — call a pass on 2nd-and-1, run on 3rd-and-7, or run from your empty formation. Save your best tendency-breaker for a critical situation.',
 'tackle_11', null, 'seed', null, true, false);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — tackle 11 shared strategy (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'tackle_11'
  and d.sanctioning_body is null
  and d.topic = 'tactics'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
