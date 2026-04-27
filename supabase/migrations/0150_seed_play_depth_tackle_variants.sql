-- Coach AI KB — Per-variant play depth for tackle formats (six_man, eight_man).
-- Universal layer (0146-0148) covers concepts shared across all variants.
-- This migration covers format-specific plays/strategy not in the universal layer.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ============ 6-MAN: format-specific plays ============

('global', null, 'play', 'play_6man_spinner_series',
 '6-man play: Spinner series',
 'Classic 6-man misdirection: QB takes snap, spins 360°, fakes to one back, hands or pitches to another, then bootlegs out. Three threats from one action. Devastating because every defender in 6-man has more ground to cover — misdirection multiplies that. Pairs with sweep, reverse, and bootleg pass off the same look.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_6man_wedge',
 '6-man play: Center wedge',
 'Center snaps and immediately drives forward; both ends pinch in to form a wedge; QB tucks behind and follows. Best short-yardage play in 6-man — only 3 linemen means defense can''t plug every gap. Variant: QB hands to a back trailing the wedge.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_6man_end_around',
 '6-man play: End around',
 'End motions across the formation pre-snap; QB hands off as he crosses. Hits the perimeter fast on a wide field (80 yds wide in some leagues). Pairs with QB keeper opposite for misdirection.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_6man_jump_pass',
 '6-man play: Jump pass',
 'QB fakes dive, jumps, and throws short over LBs to TE/end leaking out. 6-man defenses often crash hard on the run — the jump pass punishes over-aggression. Limited drop-back time, so timing is everything.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_6man_three_man_flood',
 '6-man play: Three-man flood',
 'Only 3 eligible receivers in some 6-man rules — flood concept stretches a single defender vertically with all 3. Deep, intermediate, flat from the same side. A staple because route combos are limited by personnel.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_6man_double_pass',
 '6-man play: Double pass / hook-and-lateral',
 'Trick play that thrives in 6-man: QB throws short, receiver laterals to a trailer, or QB hands off and back throws downfield. Legality varies by league (some 6-man rules require a second forward pass to come from behind LOS — verify locally).',
 'six_man', null, 'seed', null, true, false),

-- ============ 6-MAN: format-specific strategy ============

('global', null, 'strategy', 'strat_6man_15yd_first_down',
 '6-man strategy: 15-yard 1st down math',
 '6-man requires 15 yards for a 1st down (vs 10 in 11-man). Means avg 5 yds/play just to stay on schedule. Coaches must script chunk plays — checkdowns and 3-yd runs lose ground. Favor concepts that hit 8+ yards: deep crossers, vertical posts, sweeps to space.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_6man_inverted_scoring',
 '6-man strategy: Inverted PAT scoring',
 '6-man inverts kick vs run/pass PAT values (kick = 2 pts, run/pass = 1 pt) because kicks are rare and harder. Strategy: train at least one player to kick — the +1 pt advantage compounds in close games. Late-game decisions hinge on this.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_6man_45pt_mercy',
 '6-man strategy: 45-point mercy rule',
 'Most 6-man leagues end the game when one team leads by 45 at halftime or later. Strategy: build the lead aggressively early — onside kicks, 4th-down conversions, deep shots. Once up 30+, switch to clock-killers to reach 45 fast and end it.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_6man_field_width',
 '6-man strategy: Field width attack',
 'Field is 80×40 (10 yds narrower) — defenders cover proportionally less ground east-west but the offense has only 6 blockers. Spread defenders horizontally (motion, trips, bunch) and force them to declare; then run/throw at the lightest side.',
 'six_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_6man_qb_runner',
 '6-man strategy: QB as primary runner',
 'In 6-man, QB run game is the highest-leverage play — adds an extra blocker and removes the handoff timing risk. QB power, QB sweep, QB draw, QB option. Best 6-man teams have a dual-threat QB who can throw deep AND run for 100+ yards.',
 'six_man', null, 'seed', null, true, false),

-- ============ 8-MAN: format-specific plays ============

('global', null, 'play', 'play_8man_power_sweep',
 '8-man play: Power sweep',
 '8-man has 5 OL + RB + 2 ends. Power sweep pulls a guard and the backside end; FB/wing leads. More blockers in space than 11-man relative to defenders. Wide field (some leagues 80 yds) makes the sweep elite.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_8man_belly_option',
 '8-man play: Belly option',
 '8-man triple option: QB rides FB into B-gap (give read), pulls and attacks DE (keep-or-pitch read), pitches to wing. Common in small-school 8-man — only need 4 disciplined blockers up front to make it go. Pairs with belly play-action pass.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_8man_jet_sweep_rpo',
 '8-man play: Jet sweep RPO',
 'Wing motions across pre-snap for jet sweep; QB reads playside DE. If DE crashes on jet, QB pulls and runs/throws. With only 8 defenders, the unblocked DE conflict is brutal — modern 8-man staple.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_8man_pa_post_wheel',
 '8-man play: PA Post-Wheel',
 'Play-action off belly or power; X runs post, wing/RB runs wheel. With only 3-deep coverage available in 8-man (often Cover 3 with 5-man box), post-wheel divides the safety. Top deep-shot concept in 8-man.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_8man_split_back_veer',
 '8-man play: Split-back veer',
 'Both backs split behind QB; QB rides nearside back (dive), then options on the DE. If DE stays inside, QB keeps; if DE chases, QB pitches to far back. Old-school 8-man staple — high attempts per game in option-based programs.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_8man_trips_bubble_screen',
 '8-man play: Trips bubble screen',
 'Trips into the boundary forces defense to either stack the box or cover trips — can''t do both with 8. Bubble to #2 with #1 cracking the corner. Easy 5-7 yds, scales up if defense cheats.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'play', 'play_8man_shovel_option',
 '8-man play: Shovel option',
 'QB attacks the edge; pitches forward (shovel) to a trailing wing if DE stays inside, or keeps if DE crashes. Quicker than traditional pitch — fits 8-man''s tighter timing windows.',
 'eight_man', null, 'seed', null, true, false),

-- ============ 8-MAN: format-specific strategy ============

('global', null, 'strategy', 'strat_8man_box_count',
 '8-man strategy: Box count math',
 '8-man defense usually has 5 in the box (4 DL + 1 LB) with 3 defensive backs. Spread the field with 3 WRs and the math says someone is unblocked or someone is uncovered — every play. Pre-snap read tells you which.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_8man_no_3rd_drb',
 '8-man strategy: No 3rd DB exploitation',
 'Many 8-man defenses run 4-3 with only 3 DBs — no nickel. Trips and 4-WR sets force a LB to cover a slot. Match speed vs that LB on every snap; live there until they adjust.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_8man_field_width',
 '8-man strategy: Field width and edge games',
 '8-man field is 80×40 in many leagues. Edge defenders have more grass to cover and fewer help defenders. Sweeps, jets, and option pitches are higher-EV than between-the-tackles runs unless the box is light.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_8man_pat_choice',
 '8-man strategy: PAT scoring values',
 'Most 8-man leagues: kick PAT = 2, run/pass PAT = 1, like 6-man. If you have a kicker, take the +1 every time. If not, develop kid-favorable run/pass PATs (QB sneak, swing pass) — never settle for routine attempts.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_8man_45pt_mercy',
 '8-man strategy: 45-point mercy',
 'Mercy at 45 in 2nd half (most leagues). Same logic as 6-man — score early and often, then bleed clock once 30+ ahead to trigger mercy and end the game faster.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_8man_qb_run_premium',
 '8-man strategy: QB run premium',
 'QB run plays add an extra hat to the box. With only 8 defenders, that math swing is huge. QB power, QB counter, QB sweep, zone read keep — must be ≥30% of called runs in any modern 8-man offense.',
 'eight_man', null, 'seed', null, true, false),

('global', null, 'strategy', 'strat_8man_pa_premium',
 '8-man strategy: Play-action premium',
 '8-man LBs usually fly to the run because they''re in a 5-man box where every gap matters. Play-action freezes them for an extra beat — opens deep crossers, post-wheel, and seam routes. Run play-action 30%+ of pass calls.',
 'eight_man', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — tackle variant play/strategy depth', null
from public.rag_documents d
where d.sport_variant in ('six_man','eight_man')
  and d.source = 'seed' and d.retired_at is null
  and (d.subtopic like 'play_6man_%' or d.subtopic like 'play_8man_%'
       or d.subtopic like 'strat_6man_%' or d.subtopic like 'strat_8man_%')
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
