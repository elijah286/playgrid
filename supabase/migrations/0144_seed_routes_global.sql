-- Coach AI KB — Universal route catalog (sport_variant=NULL, applies to all formats).
-- Each route gets its own chunk so vector retrieval can surface the exact one.
-- Topic='scheme', subtopic='route_<name>'.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Vertical routes (deep) ───────────────────────────────────────
('global', null, 'scheme', 'route_go',
 'Route: Go (Fly / Streak / 9)',
 'Straight vertical sprint downfield. Receiver gets a clean release, accelerates upfield, ball thrown over the top with timing on stride. Route tree #9. Stretches the defense vertically. Best vs single-high coverage with no deep help over the top of the receiver.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_post',
 'Route: Post',
 'Vertical 12-15 yards then break inside at a 45-degree angle toward the goal post. Route tree #8. Beats single-high (Cover 1, Cover 3) when the safety bites on play-action or the seam, and beats Cover 2 when thrown between the safeties. Pair with deep crosser to clear the safety.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_corner',
 'Route: Corner (Flag)',
 'Vertical 10-12 yards then break outside at a 45-degree angle toward the pylon. Route tree #7. Beats Cover 2 (corner sits flat) and Cover 4 (corner stays inside on outside #1). Often the high in a smash concept.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_skinny_post',
 'Route: Skinny post (Glance)',
 'Vertical 8-12 yards then a slight inside break — flatter than a true post, 15-20 degrees. Beats Cover 3 between the corner and the deep middle safety. Common as the pass option in inside-zone RPOs.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_seam',
 'Route: Seam',
 'Vertical sprint from a slot or TE alignment, splitting the deep safeties. Beats Cover 2 (gap between safeties) and Cover 4 (vertical the safety can''t carry). Foundation route in 4 verts.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_bender',
 'Route: Bender',
 'Inside receiver runs vertical and bends to the post or to the seam based on the safety''s movement. Hybrid post/seam — route adjusts to coverage rotation. Common Air Raid concept (mesh-bender).',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_fade',
 'Route: Fade',
 'Vertical with an outside lean, ball thrown to the back-shoulder or over the top to the sideline. Usually called for a tall WR vs a short DB. Red zone staple — defender can''t recover when the throw is placed up and away.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_back_shoulder',
 'Route: Back-shoulder fade',
 'Vertical release; ball thrown short of the receiver toward his back hip. Receiver must turn back and make a contested catch. Beats tight man coverage when the defender''s back is to the ball.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_wheel',
 'Route: Wheel',
 'RB or slot WR releases to the flat then turns up the sideline (forming a "wheel" path). Beats LBs in man coverage who can''t run with a back. Common pair with a deep crosser to clear the safety.',
 null, null, 'seed', null, true, false),

-- ── Intermediate routes (8-15 yards) ─────────────────────────────
('global', null, 'scheme', 'route_dig',
 'Route: Dig (In / Square-in)',
 'Vertical 12-15 yards then a sharp 90-degree break to the inside, finishing across the middle. Route tree #4. Beats man and zone — sits in the window between LB depth and safety depth. Foundation of dig-post and levels concepts.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_out',
 'Route: Out (Square-out)',
 'Vertical 10-12 yards then a sharp 90-degree break to the outside, finishing toward the sideline. Route tree #3. Stops the clock — common late-game call. Vulnerable to jumping cornerback if undisguised.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_comeback',
 'Route: Comeback',
 'Vertical 12-15 yards then a sharp break back at a 45-degree angle toward the sideline (sometimes called "snag" depending on system). Route tree #5. Sideline route, stops clock. Defender must drive forward — comeback wins on the cushion.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_curl',
 'Route: Curl (Hook)',
 'Vertical 10-12 yards then turn back toward the QB, settling in a soft spot in the zone. Route tree #6. Reliable vs zone coverage — find the window between defenders. Soft-shoulder finish facing QB.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_sail',
 'Route: Sail',
 'Receiver runs an angled out at 12-15 yards toward the sideline (between an out and a corner). Common as the medium piece in flood concepts.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_speed_out',
 'Route: Speed out',
 'Quick out at 5-7 yards, no break-down — full speed through the cut. Used to beat off coverage and gain easy yards on the perimeter. Common 1st-down call.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_whip',
 'Route: Whip (whip-in)',
 'Receiver fakes outward (like a quick out) for 3-5 yards, then whips back inside on a slant angle. Misdirection route — beats man when defender bites on the out fake.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_pivot',
 'Route: Pivot',
 'Receiver runs a short outside route then pivots back inside (or vice versa). Used vs man — defender opens hips outside, receiver pivots inside for a free release.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_stick',
 'Route: Stick',
 'Receiver runs to depth (typically 5-6 yards) and "sticks" — sits down facing the QB. Foundation of the stick concept (with a flat underneath and a clear over the top). Quick-game staple, 3rd-and-medium reliable.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_snag',
 'Route: Snag',
 'Receiver releases inside, settles 5-6 yards downfield in a soft spot. Often the inside route in a snag concept (with corner over and flat under). A more deliberate sit than a hitch.',
 null, null, 'seed', null, true, false),

-- ── Short / quick routes ─────────────────────────────────────────
('global', null, 'scheme', 'route_slant',
 'Route: Slant',
 '3-step quick break inside at a 45-degree angle. Route tree #2. Catches the ball at 4-6 yards. Beats press man (receiver wins inside leverage) and Cover 2 (slant fits between underneath defenders). Most common quick-game call in football.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_hitch',
 'Route: Hitch',
 '5-yard vertical release then a quick turn back to the QB. Route tree #1. Catches at 4-5 yards. Beats off-coverage instantly. Quick game staple — easy completion to keep the chains moving.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_quick_out',
 'Route: Quick out',
 '5-yard out — vertical then sharp 90-degree break to the sideline. Catches at 4-5 yards. Beats off-man, stops the clock, and gets the ball out fast vs pressure.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_drag',
 'Route: Drag (Shallow cross)',
 'Receiver releases across the formation at 3-5 yards depth. Foundation of mesh and shallow concepts. Beats man — defender has to fight through traffic.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_shoot',
 'Route: Shoot',
 'RB (or aligned-tight receiver) releases hard to the flat at depth 0-2 yards. Like an arrow but flatter. Beats man on a LB. Common screen alternative.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_arrow',
 'Route: Arrow',
 'RB or slot releases to the flat at a slight angle, gaining depth (~3 yards). Outlet for the QB and high-low partner with a sit/curl over the top.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_flat',
 'Route: Flat',
 'Receiver releases directly to the sideline at 0-3 yards depth. Common RB or slot route paired with a curl/corner over the top to high-low the flat defender.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_swing',
 'Route: Swing',
 'RB releases laterally out of the backfield to the flat at 0 yards depth. Outlet/dump-off — easy yards if the LB doesn''t carry.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_check_down',
 'Route: Check-down',
 'RB stays in the backfield to scan for blitz, then releases to the flat or middle if no help is needed. Last option in the QB''s progression — take the easy yards rather than force a downfield throw.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_shallow',
 'Route: Shallow',
 'Tight crossing route at 1-3 yards depth, often deeper version of a drag. Foundation of "shallow cross" concepts (drive, mesh).',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_bubble_screen',
 'Route: Bubble screen',
 'Receiver releases backward and outside in a banana arc, catching a quick lateral pass behind the LOS. Other receivers block downfield. Common RPO tag.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_tunnel_screen',
 'Route: Tunnel screen',
 'Outside receiver takes 2-3 hard outside steps then plants and works back inside for the catch. Inside receivers crack-block out. Counters aggressive corners.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_now_screen',
 'Route: Now screen',
 'Receiver catches the ball immediately (1-step release, ball thrown right at the snap). The "now" of run-pass options — used to punish defenses giving 7+ yard cushions.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_jet_motion',
 'Route: Jet motion (sweep route)',
 'Receiver is in full speed motion at the snap, taking a quick handoff or short pass behind the LOS. Used in jet-sweep series and constraint plays off inside zone.',
 null, null, 'seed', null, true, false),

-- ── Double moves / advanced ──────────────────────────────────────
('global', null, 'scheme', 'route_sluggo',
 'Route: Sluggo (Slant-and-go)',
 'Fake a slant for 2-3 steps, then break vertical. Beats man defenders and Cover 3 corners who jump the slant. Best after a slant has hit earlier in the game.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_hitch_and_go',
 'Route: Hitch-and-go',
 'Sell the hitch — break down at 5 yards then sprint vertical. Beats off-coverage corners who break aggressively on the hitch.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_out_and_up',
 'Route: Out-and-up',
 'Sell the quick out, then break vertical up the sideline. Beats corners who jump outs. Effective on the boundary.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_post_corner',
 'Route: Post-corner',
 'Sell the post (inside break at 12 yards), then break back outside to the corner. Beats single-high safeties biting on the post. Slower-developing.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_corner_post',
 'Route: Corner-post',
 'Sell the corner (outside break at 10-12 yards), then break back inside to the post. Beats Cover 2 corners turning their hips outside.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_double_post',
 'Route: Double post',
 'Two post routes from adjacent receivers — high post (deeper) and low post (intermediate). Stretches the safety vertically. Pick one based on where the safety commits.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_choice',
 'Route: Choice',
 'Receiver reads the leverage of the defender at the snap and breaks accordingly. Common: outside leverage = slant, inside leverage = quick out. Requires QB-WR sync.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_option',
 'Route: Option (sit-or-cut)',
 'Receiver runs to depth, then sits vs zone or breaks inside/outside vs man. Read happens at the cut. Quick-game versatility — typically a slot or TE route.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_texas',
 'Route: Texas (RB angle)',
 'RB releases on an angle route — fakes outside then breaks back inside at 5-6 yards. Beats LB man coverage. Patriots / Erhardt-Perkins staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_angle',
 'Route: Angle',
 'Generic name for a route where the receiver releases one direction and breaks back the other (e.g., RB angle / Texas, slot angle).',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_crack_replace',
 'Route: Crack-replace',
 'Outside receiver "cracks" inside on a defender (block), and a slot/RB "replaces" outside via the route. Hybrid run-pass mechanism.',
 null, null, 'seed', null, true, false),

-- ── TE / specialty ───────────────────────────────────────────────
('global', null, 'scheme', 'route_y_iso',
 'Route: Y-iso (TE iso)',
 'TE runs an isolated route (often a curl, dig, or seam) in a window with no help. Used to attack a single defender on the TE — typically a LB.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_y_stick',
 'Route: Y-stick',
 'TE runs the stick route in a 3-receiver stick concept (#1 vertical, TE stick, slot/RB flat). Reliable concept on 3rd-and-medium.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_bench',
 'Route: Bench',
 'Receiver releases vertical then breaks at a 45-degree angle to the sideline at depth (similar to corner but deeper, sometimes called a "deep out").',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_deep_cross',
 'Route: Deep cross (over)',
 'Receiver runs a crossing route at 15-18 yards depth, finishing on the opposite side of the field. Foundation of Y-cross / drive concepts. Beats man and zone.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_chair',
 'Route: Chair',
 'Combination outside-then-inside route resembling an "L" lying on its side — like a deep out with an inside leg. Less common; specific to a few schemes.',
 null, null, 'seed', null, true, false),

-- ── Route tree reference ─────────────────────────────────────────
('global', null, 'scheme', 'route_tree_west_coast',
 'Route tree: West Coast / NFL numbering',
 'Standard route tree (right side, mirror for left): 0/1 = hitch/quick, 2 = slant, 3 = out, 4 = in/dig, 5 = comeback, 6 = curl, 7 = corner, 8 = post, 9 = go/fly. Coaches call routes by tree number ("84 Z post") or by name. Most US offenses use this convention.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'route_tree_air_raid',
 'Route tree: Air Raid concepts',
 'Air Raid offenses (Mike Leach, Hal Mumme) use named concepts (Mesh, Y-cross, Stick, Shallow, Y-Sail, Snag, 6, 4 verts, Smash) rather than numbered route trees. Each concept has a fixed route distribution and a built-in QB read. Concepts are mirrored and tagged by formation.',
 null, null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — universal route catalog', null
from public.rag_documents d
where d.sport_variant is null and d.topic = 'scheme'
  and (d.subtopic like 'route_%')
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
