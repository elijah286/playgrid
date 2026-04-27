-- Coach AI KB — Universal play concepts deep-dive (sport_variant=NULL).
-- Per-concept chunks naming the routes, the QB read, the coverage it beats,
-- and common tags/variations.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Foundational pass concepts ───────────────────────────────────
('global', null, 'scheme', 'concept_mesh',
 'Concept: Mesh',
 'Two shallow crossing routes (3-4 yards depth) brushing past each other in the middle. Outside receivers run vertical clear-outs or sit routes. RB releases to flat as outlet. QB reads man vs zone — vs man, hit the crosser running away from his defender; vs zone, hit whoever finds the soft spot. Beats man with natural rubs; beats zone by finding holes. Air Raid foundation.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_mesh_bender',
 'Concept: Mesh-bender',
 'Mesh with the inside slot running a bender (vertical with a bend to the seam or post). Stretches the middle vertically while the mesh attacks horizontally. Hits the bender vs single-high coverage; mesh routes vs everything else.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_y_cross',
 'Concept: Y-Cross',
 'TE/Y runs a deep crosser at 15-18 yards, paired with a deep clear-out (post/go) on top and a flat/drag underneath. Triangle stretch — high, medium, low on the same side. QB reads the safety, then the LB. Beats man and zone equally. Air Raid + West Coast staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_smash',
 'Concept: Smash',
 'Outside receiver runs a 5-yard hitch (low), inside receiver runs a corner route at 10-12 yards (high). High-low on the cornerback. CB jumps the hitch = throw the corner; CB sinks under the corner = throw the hitch. Beats Cover 2 and any soft-corner technique.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_smash_china',
 'Concept: Smash-China',
 'Smash with the inside #2 running a deep over (china) instead of a corner. Stresses Cover 2 even more — over routes split the safeties while the hitch holds the corner.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_stick',
 'Concept: Stick',
 'Trips formation. #1 (outside) clears with a fade or quick out; #2 (middle) runs the stick (5-6 yard hook); #3 (inside, RB or slot) runs the flat. QB reads the flat defender — flat = throw stick, stick = throw flat. Reliable third-and-medium concept vs any coverage.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_stick_nod',
 'Concept: Stick-nod',
 'Variation of stick where the stick receiver fakes the hook and breaks vertical (slant-and-go-style). Beats defenders who jump the stick. Best as a tag once stick has hit earlier.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_snag',
 'Concept: Snag',
 'Triangle concept: corner route from #1 (high), snag/sit from #2 (mid), flat from #3 (low). QB reads the corner defender — corner sits on the snag = throw corner; corner widens to the corner route = throw snag. Beats man and most zones.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_sail',
 'Concept: Sail (Flood)',
 'Three routes at three depths to one side: deep go (high), sail (mid out at 10-12 yards), flat (low). Forces a single underneath defender to choose. Beats Cover 3 and most rotated zones. Erhardt-Perkins favorite.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_levels',
 'Concept: Levels',
 'Two crossing dig routes at different depths (6 yards and 12 yards) on the same side. High-low on the underneath linebacker. LB sinks = hit the low dig; LB drives short = hit the high dig. Indianapolis Colts (Manning era) staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_drive',
 'Concept: Drive',
 'Inside receiver runs a shallow drag at 3-5 yards, outside receiver runs a 12-yard dig over the top. Two crossers attacking the middle. Beats man (rub on releases) and zone (dig settles in the hole behind the LB).',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_shallow',
 'Concept: Shallow Cross',
 'One receiver runs a shallow cross (1-3 yards) underneath. Paired with a dig or comeback over the top. Air Raid version of "drive". QB reads man vs zone — vs man, the shallow rubs free; vs zone, the dig finds the hole.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_curl_flat',
 'Concept: Curl-flat',
 'Outside WR runs a 12-yard curl, slot/RB runs a flat. High-low on the flat/curl defender. He sinks into the curl = hit flat; he widens to flat = hit curl. Reliable third-and-medium concept against any coverage with a defender in the curl-flat zone.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_four_verts',
 'Concept: 4 Verts',
 'Four receivers run vertical routes, stretching all four deep quarters. Inside receivers run seams; outside receivers run go routes. QB reads the safeties: split safeties = throw the seam, single-high = throw outside the numbers. Beats Cover 2, Cover 3, Cover 4 (with bender tag). Air Raid foundation.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_all_curls',
 'Concept: All Curls',
 'Every receiver runs a 10-12 yard curl, settles in zone holes. Reliable vs zone — find the open one. Vulnerable to man coverage if the QB doesn''t have a hot built in.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_all_go',
 'Concept: All Go',
 'Every receiver runs a vertical (go/seam). Pure vertical stretch. Best when defense is single-high and you have a deep speed mismatch.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_double_post',
 'Concept: Double Post',
 'Two post routes from adjacent receivers — high post (deeper, ~18 yards) and low post (~12 yards). Stretches the safety vertically; attacks the area between corner and safety. Best vs Cover 1 / Cover 3.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_dagger',
 'Concept: Dagger',
 'Inside receiver runs a clear seam, outside receiver runs a deep dig (15-18 yards). The seam clears the safety; the dig settles in the void behind the LB. Modern NFL shot play.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_post_wheel',
 'Concept: Post-Wheel',
 'Outside receiver runs a deep post (clears the safety to the middle), slot/RB runs a wheel up the sideline. The post creates the void where the wheel finishes. Deadly vs man coverage on a LB.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_corner_post',
 'Concept: Corner-post combo',
 'Outside receiver runs a corner; slot runs a post under it. Stresses the safety horizontally — both can''t be covered by one player. Common red zone shot.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'concept_levels_cross',
 'Concept: Levels-cross hybrid',
 'Levels (two digs) tagged with a deep crosser from the backside #1. Three crossing routes at three depths. Floods the middle of the field.',
 null, null, 'seed', null, true, false),

-- ── RPO families ─────────────────────────────────────────────────
('global', null, 'scheme', 'rpo_glance',
 'RPO: Inside zone / Glance',
 'Inside zone for the RB. Slot WR runs a glance (skinny post). QB reads the playside LB or safety — flow to run = throw the glance, drop = hand off. The skinny post hits in the void behind the LB. Modern foundation RPO.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'rpo_bubble',
 'RPO: Inside zone / Bubble',
 'Inside zone with a bubble screen attached to the slot. QB reads the slot defender — defender widens with bubble = hand off, defender stays inside = throw bubble. Punishes defenses that don''t honor the perimeter.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'rpo_now',
 'RPO: Inside zone / Now',
 'Inside zone with a "now" screen (1-step throw to outside WR). QB reads the corner''s cushion — soft cushion = throw now, tight = hand off. Easy 5+ yards vs off-coverage.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'rpo_stick',
 'RPO: Inside zone / Stick',
 'Inside zone with a stick route from the slot. QB reads the curl-flat defender — drop into stick = hand off, sit = throw stick. Combines run conflict with a high-percentage throw.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'rpo_pop_pass',
 'RPO: Inside zone / Pop pass',
 'Inside zone with a TE pop pass behind the LB. TE delays then pops up at 5-8 yards. QB reads the MLB — flow to run = pop the TE; drop = hand off.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'rpo_post_snap',
 'RPO: Post-snap RPO',
 'QB reads a post-snap defender (typically a LB) and decides handoff vs throw based on his post-snap movement. The throw is a quick concept (slant, glance, stick). True RPO — defender can''t be right.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'rpo_pre_snap',
 'RPO: Pre-snap RPO',
 'QB reads numbers/leverage pre-snap — if defense is light to one side, throw the perimeter pass; if loaded, hand off the inside run. Used to attack coverage tells. Easier on the QB than post-snap RPOs.',
 null, null, 'seed', null, true, false),

-- ── Screen families ─────────────────────────────────────────────
('global', null, 'scheme', 'screen_bubble',
 'Screen: Bubble',
 'Slot receiver releases backward in a banana arc, catches a quick lateral pass behind the LOS. Outside WRs block downfield (or "stalk"). Quickest screen — the ball is out before the rush gets to the QB.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'screen_now',
 'Screen: Now',
 'Outside WR catches the ball immediately (ball thrown right at the snap). One-step release, no break-down. Easy 5+ yards vs off-coverage corners. Common RPO tag.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'screen_tunnel',
 'Screen: Tunnel',
 'Outside WR takes 2-3 hard outside steps (selling vertical), then plants and works back inside for the catch. Inside WRs crack-block out on the corners. Counters aggressive corners.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'screen_jailbreak',
 'Screen: Jailbreak (all-block)',
 'WR screen with all five OL releasing downfield to block. Extremely high-yield if it hits — 20+ yard play. High risk: long-developing, vulnerable to a defender breaking through.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'screen_rb_slow',
 'Screen: RB slow screen',
 'QB drops 5 steps as if to pass; OL fakes pass-pro then releases to block. RB sits, then releases to a flat 1-2 yards behind the LOS. Counters aggressive pass rush. Classic screen.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'screen_rb_swing',
 'Screen: RB swing/jet screen',
 'RB releases laterally to the flat at the snap; QB delivers immediately with a single OL leading. Quick-hitting — beats blitz when the LB doesn''t carry the back.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'screen_te',
 'Screen: TE screen / shovel',
 'TE releases like a pass-blocker, then settles short and catches a quick toss. Ball is delivered low and short. Common goal-line / short-yardage trick.',
 null, null, 'seed', null, true, false),

-- ── Run game concepts ────────────────────────────────────────────
('global', null, 'scheme', 'run_inside_zone',
 'Run: Inside zone',
 'OL steps playside, double-teams the playside DT, climbs to the LBs. RB takes a slight cutback path, reading the first down lineman to the backside of the center — bang/bend/bounce. Foundation of most modern run games. Pairs naturally with RPOs.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_outside_zone',
 'Run: Outside zone (stretch / wide zone)',
 'All five OL lateral-step playside, attempting to outflank the front. RB aims for the playside tackle''s outside hip and reads the first DL: cut up if the edge is sealed, bounce outside if not. Demands athletic OL. Shanahan / McVay foundation.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_power',
 'Run: Power (gap scheme)',
 'Backside guard pulls and kicks out the playside edge (or seals the playside LB). Playside OL down-blocks. RB follows the puller through the B-gap. Tough-yard run — short-yardage and goal-line staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_counter',
 'Run: Counter (GT / GH)',
 'Two backside players pull — typically the backside guard + tackle (GT) or guard + H-back (GH). RB takes a counter step away then follows the pullers. Misdirection forces the defense to flow the wrong way. Joe Gibbs Counter Trey is the iconic version.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_zone_read',
 'Run: Zone read (read option)',
 'Inside zone for the RB; QB reads the unblocked backside DE. If DE crashes the RB, QB pulls and runs the edge. If DE stays home, QB hands off. Defines spread option offenses.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_iso',
 'Run: Iso (isolation)',
 'I-formation lead run. OL down-blocks gaps, FB leads through the hole on the playside LB, RB follows. Smash-mouth football — works against undisciplined linebackers.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_trap',
 'Run: Trap',
 'Backside guard pulls and trap-blocks the playside DT (who''s left unblocked initially). DT thinks he''s free, then gets hit from the side. Wing-T / power running staple. Devastating if executed well.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_dive',
 'Run: Dive',
 'Quick handoff to a back attacking the interior gap (typically A-gap). Simple, fast-hitting. Common in option offenses (the dive is the first read of the triple).',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_jet_sweep',
 'Run: Jet sweep',
 'A receiver in full motion takes a quick handoff or pitch behind the LOS at the snap, sweeping wide. Puts the ball on the perimeter fast. Often used as a packaged play with inside zone.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_speed_option',
 'Run: Speed option',
 'QB attacks the edge and pitches to the trailing back if the edge defender attacks him. No mesh with a dive — pure 2-way option on the edge. Common in spread option offenses.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_triple_option',
 'Run: Triple option',
 'QB reads dive (FB) → keep (QB) → pitch (slot). Three potential ball-carriers, three reads. Defines flexbone (Air Force / Navy / Georgia Tech). Devastating to undisciplined defenses.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_qb_power',
 'Run: QB power (designed)',
 'QB carries on a power scheme (pulling guard). Adds a numbers advantage in the box (one extra blocker since the QB is now a runner). Common goal-line staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'run_qb_draw',
 'Run: QB draw',
 'Standard pass-set look from the OL, then the QB tucks and runs through a designed gap. Beats aggressive pass rushes. Must be tagged carefully — too often = predictable.',
 null, null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — universal play concept catalog', null
from public.rag_documents d
where d.sport_variant is null and d.topic = 'scheme'
  and (d.subtopic like 'concept_%' or d.subtopic like 'rpo_%'
       or d.subtopic like 'screen_%' or d.subtopic like 'run_%')
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
