-- Coach AI KB — reinforce that the center is an eligible receiver in flag 5v5.
-- Earlier seeded pass concepts (Snag, Stick, Smash, Mesh, etc.) describe routes
-- only for the perimeter receivers, leaving C standing still when Cal generates
-- a diagram. This chunk + per-concept reminders push Cal to assign a route to
-- C on every pass play in 5v5.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

('global', null, 'rules', 'flag_5v5_center_eligible',
 'NFL Flag 5v5 — Center is an eligible receiver',
 E'In NFL Flag 5v5 (and most 5-on-5 flag rule sets) the center is an ELIGIBLE RECEIVER. There are only 5 offensive players — QB, center, and 3 skill — so nobody is purely a blocker. The center snaps the ball and then releases on a route just like the other receivers.\n\nWhen drawing or coaching a 5v5 pass play, every receiver including C should have an assignment. Common center routes:\n  • Quick check-down / sit at 2-3 yards (universal outlet)\n  • Shallow drag across the formation (1-3 yards) — pairs with mesh, drive, or any high-low concept\n  • Swing / shoot to the flat after a one-count delay\n  • Stick / hook at 4-5 yards in the soft zone behind the rusher\n  • Wheel out of the backfield as a tag\n\nA Snag, Stick, Smash, Mesh, Levels, Curl-Flat, Y-Cross, or Drive concept that leaves the center standing at the LOS is incomplete. Give C a route. The only exceptions are screens where C is the designated outlet (still gets a route — to the screen spot) and designed QB runs.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

-- Per-concept reminders so search_kb on a specific play surfaces the C-route guidance.
('global', null, 'scheme', 'play_snag',
 'NFL Flag 5v5 — Snag — Center route',
 'In 5v5 Snag, after C is drawn the standard triangle (corner from #1, snag from #2, flat from #3), C runs a quick sit/check-down at 2-3 yards behind the QB as the hot outlet vs blitz. Without a C route the play has only 3 receivers — broken in 5v5.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_stick',
 'NFL Flag 5v5 — Stick — Center route',
 'In 5v5 Stick, the perimeter triangle is fade/stick/flat. C runs a 3-yard drag across the formation (or a sit at 2 yards) as the dump-off. With only 5 offensive players, C must be in the route distribution.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_smash',
 'NFL Flag 5v5 — Smash — Center route',
 'In 5v5 Smash, hitch + corner stretches the CB; the third receiver runs a backside dig or post; C runs a quick sit at 2-3 yards as the outlet. Five eligibles means C must be assigned a route.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_mesh',
 'NFL Flag 5v5 — Mesh — Center route',
 'In 5v5 Mesh, two receivers cross at 2-3 yards and a third runs a corner over the top. C runs a sit at 4-5 yards behind the mesh point as a soft-zone outlet (or pairs as one of the mesh runners if the coach wants a tighter rub).',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_levels',
 'NFL Flag 5v5 — Levels — Center route',
 'In 5v5 Levels, two digs at different depths attack the same area. C runs a swing or shoot to the flat opposite the dig side as the outlet — drags the LB the wrong way and forces the defense to honor a 4th receiver.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_curl_flat',
 'NFL Flag 5v5 — Curl-Flat — Center route',
 'In 5v5 Curl-Flat, the curl + flat stretch the flat defender on one side. C runs a sit at 3 yards over the ball as the middle-of-field outlet — gives the QB a third option if both stretch routes are covered.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_y_cross',
 'NFL Flag 5v5 — Y-Cross — Center route',
 'In 5v5 Y-Cross, the deep crosser is the primary; outside go routes clear; the 3rd skill runs a flat. C runs a delayed drag at 2-3 yards behind the crosser — second-level option if the cross is bracketed.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_drive',
 'NFL Flag 5v5 — Drive — Center route',
 'In 5v5 Drive (shallow + dig), the shallow and dig are the named routes; perimeter receivers run clearouts. C runs a sit at 2 yards as the immediate hot outlet vs pressure.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_wheel',
 'NFL Flag 5v5 — Wheel — Center route',
 'In 5v5 Wheel, the inside slot wheels up the sideline; outside runs a slant/post to clear. C runs a 3-yard drag across the formation as the outlet — also rubs the man defender chasing the wheel.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_post_wheel',
 'NFL Flag 5v5 — Post-Wheel — Center route',
 'In 5v5 Post-Wheel, post + wheel forces a defensive switch. C runs a sit at 3 yards as the outlet if the switch is executed cleanly and both deep options are taken away.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_flood',
 'NFL Flag 5v5 — Flood — Center route',
 'In 5v5 Flood, three routes attack one side at three depths (deep / sail / flat). C runs a backside drag or shallow check-down — gives the QB a backside answer if the flood side is rotated to.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false),

('global', null, 'scheme', 'play_screen',
 'NFL Flag 5v5 — Screen / Bubble — Center route',
 'In 5v5 Screens, the bubble/now goes to the perimeter receiver; other receivers clear or set up natural picks (no blocking). C releases as the late outlet over the middle if the perimeter is jumped — a 2-3 yard sit is enough.',
 'flag_5v5', 'nfl_flag', 'seed', null, true, false);
