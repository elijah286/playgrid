-- Coach AI KB — 6-man tackle football: penalties + plays + defenses + strategy + coaching.
-- 6-man is its own variant: 80×40 field, 15 yards for first down, all players eligible,
-- mandatory 15-yard handoff/pass on offense (no QB run after snap until ball changes hands
-- in some rule sets). Common in small-school Texas, Oklahoma, Montana.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Penalties ────────────────────────────────────────────────────
('global', null, 'rules', 'penalty_false_start',
 '6-man — Penalty: False start',
 'Movement by an offensive player after the set. Penalty: 5 yards, replay the down.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_offside',
 '6-man — Penalty: Offside',
 'Defender across the LOS at snap. Penalty: 5 yards, replay the down. Live ball.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_holding',
 '6-man — Penalty: Holding',
 'Restraining an opponent by means other than legal blocking. Penalty: 10 yards (15 yards in some rule sets).',
 'six_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_pi',
 '6-man — Penalty: Pass interference',
 'DPI: 15 yards from previous spot, automatic first down. OPI: 15 yards, loss of down.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_facemask',
 '6-man — Penalty: Face mask',
 'Grasping the face mask of an opponent. Penalty: 15 yards, automatic first down vs defense.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_personal_foul',
 '6-man — Penalty: Personal foul',
 'Late hit, unnecessary roughness, hitting a defenseless player. Penalty: 15 yards, automatic first down.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_targeting',
 '6-man — Penalty: Targeting',
 'Forcible contact to the head/neck of a defenseless player or leading with the helmet. Penalty: 15 yards. Some state rules add ejection.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'rules', 'penalty_unsportsmanlike',
 '6-man — Penalty: Unsportsmanlike',
 'Taunting, profanity, excessive celebration. Penalty: 15 yards. Two on one player = ejection.',
 'six_man', null, 'seed', null, true, false),

-- ── Plays / formations ───────────────────────────────────────────
('global', null, 'scheme', 'formation_spread_6m',
 '6-man — Formation: Spread',
 'QB in shotgun, two backs flanking, receivers split wide. Stretches the defense across the 40-yard-wide field. Most common base in modern 6-man.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips_6m',
 '6-man — Formation: Trips',
 'Three eligibles to one side, single receiver opposite. Forces defense to declare coverage on the trips side, leaves backside isolated.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_diamond_6m',
 '6-man — Formation: Diamond / wishbone',
 'QB under center, three backs in a triangle behind. Old-school 6-man set — physical, run-heavy. Pairs with sweeps and reverses.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_sweep_6m',
 '6-man — Play: Sweep',
 'Pitch to a back attacking the edge with one or two lead blockers. Wide field favors edge runs — get to the boundary before the defense flows.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_reverse_6m',
 '6-man — Play: Reverse',
 'Initial pitch one direction, then flip to a receiver coming the other way. Misdirection in the open spaces of 6-man punishes over-pursuit.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_qb_pass_6m',
 '6-man — Play: QB pass after handoff exchange',
 'In rule sets requiring a hand-off or backward pass before any forward pass, fake the handoff back to the QB and throw. Common 6-man wrinkle.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_screen_6m',
 '6-man — Play: WR screen',
 'Quick screen to a wide receiver with one or two blockers in front. Counters aggressive defenses crowding the box.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_post_6m',
 '6-man — Play: Post / four verts',
 'Vertical routes stress a 6-man secondary that is structurally undermanned for the wide field. Hit the deep post over a single safety.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_jet_sweep_6m',
 '6-man — Play: Jet sweep',
 'Receiver in motion takes the snap or handoff at full speed and attacks the edge. Beats slow-flowing defenses.',
 'six_man', null, 'seed', null, true, false),

-- ── Defenses ────────────────────────────────────────────────────
('global', null, 'scheme', 'defense_33_6m',
 '6-man — Defense: 3-3',
 'Three down linemen, three defensive backs. Most common 6-man front. Balanced run/pass.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_42_6m',
 '6-man — Defense: 4-2',
 'Four down linemen, two DBs. Heavy front, vulnerable in the secondary. Use vs run-heavy opponents.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_24_6m',
 '6-man — Defense: 2-4',
 'Two down linemen, four DBs. Pass-defense oriented. Use vs spread / pass-first opponents.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_man_6m',
 '6-man — Coverage: Man',
 'Three DBs in man on three eligibles. Risky — one missed tackle is a 6 on the open field.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_zone_6m',
 '6-man — Coverage: Zone',
 'Defenders divide the field by area. Easier to teach, harder to break for big plays. Vulnerable to flooding one zone.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'scheme', 'defense_blitz_6m',
 '6-man — Pressure: Blitz',
 'Bring a 4th rusher (DB or LB-equivalent). High reward but leaves a defender free in the secondary — pick spots.',
 'six_man', null, 'seed', null, true, false),

-- ── Strategy ────────────────────────────────────────────────────
('global', null, 'tactics', 'wide_field',
 '6-man — Strategy: Use the width',
 'The 40-yard-wide field rewards horizontal stretches: sweeps, reverses, jet sweeps. Force defenders to cover ground side-to-side before they can pursue.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'first_down_6m',
 '6-man — Strategy: 15-yard first down',
 '6-man requires 15 yards (not 10) for a first down. Calls must average 5+ yards to stay on schedule. Negative-yard plays are killers — avoid deep drops without a plan.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'mercy_rule_6m',
 '6-man — Strategy: 45-point mercy rule',
 'Most 6-man rule sets end the game when one team leads by 45+ points. With high scoring norms, scores can flip fast — manage tempo accordingly.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'tempo_6m',
 '6-man — Strategy: Tempo',
 'No-huddle stresses small-roster 6-man defenses (often only 1-2 substitutes). Use it to wear down opponents, especially in the 4th quarter.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'special_teams_6m',
 '6-man — Strategy: Special teams',
 'PAT rules invert: kicked PAT = 2 points, run/pass PAT = 1 point. Encourages the harder kicked attempt. Drill kicker development.',
 'six_man', null, 'seed', null, true, false),

-- ── Coaching ────────────────────────────────────────────────────
('global', null, 'tactics', 'practice_6m',
 '6-man — Coaching: Practice structure',
 '90-min template (small rosters): 10 min warmup + tackling, 20 min position work, 25 min team install, 25 min team scrimmage, 10 min special teams.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'roster_6m',
 '6-man — Coaching: Roster management',
 'Many 6-man programs have only 8-12 players total. Cross-train EVERY player at multiple positions. One injury can end your season — depth via versatility.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'tackling_6m',
 '6-man — Coaching: Open-field tackling',
 'With the wide field, every tackle is potentially open-field. Drill rugby-style form tackling daily. Angles matter more than power — take away the cutback first.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'tactics', 'kicking_6m',
 '6-man — Coaching: Kicking development',
 'Because kicked PATs are worth 2, kicking matters more in 6-man. Identify your best kicker early. Drill kicking weekly.',
 'six_man', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — 6-man full coverage (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'six_man' and d.source = 'seed' and d.retired_at is null
  and (d.subtopic like 'penalty_%' or d.subtopic like 'play_%' or d.subtopic like 'formation_%'
       or d.subtopic like 'defense_%' or d.subtopic like '%_6m')
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
