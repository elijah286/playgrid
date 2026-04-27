-- Coach AI KB — Universal defensive schemes catalog (sport_variant=NULL).
-- Comprehensive: fronts, coverages by name and family, pressure packages,
-- match concepts, and split-field looks. Each scheme gets its own chunk.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Fronts (defensive lineman alignments) ────────────────────────
('global', null, 'scheme', 'front_43_over',
 'Front: 4-3 Over',
 '4-3 with the strong-side DT shaded over the strong-side guard (3-tech). Sam LB walks out over the TE. Strength of the front aligned to the offensive strength. Most common pro front in modern football.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_43_under',
 'Front: 4-3 Under',
 '4-3 with the weak-side DT in the 3-tech and the NT in a 1-tech to the strong side. Strong-side DE bumps to a 5-tech, weak-side DE to a wide 9. Strong vs power, weak vs zone. Pete Carroll Seahawks staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_34_2gap',
 'Front: 3-4 (2-gap)',
 'Three down linemen each responsible for two gaps (head-up alignment), letting the four LBs flow free to the ball. Big bodies up front. Bill Belichick / Romeo Crennel base.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_34_1gap',
 'Front: 3-4 (1-gap, hybrid)',
 'Three down linemen attacking single gaps (often 4i / 0 / 4i alignment), with two ILBs filling and two OLBs as edge rushers. More attacking than 2-gap. LSU / many modern college bases.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_46_bear',
 'Front: 46 (Bear)',
 'Eight in the box: 4 down linemen with both DTs in 3-techniques, both DEs wide, plus the strong safety walked down. Linebackers stack inside. Crushes the run. 1985 Bears defined it.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_tite',
 'Front: Tite (3-down 4i-0-4i)',
 'NT in 0-technique, DEs in 4i (inside shoulder of OT). Closes the B-gaps, forces runs to bounce outside where unblocked OLBs/safeties make plays. Modern college defense (Iowa State / Air Force / Oklahoma).',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_wide_9',
 'Front: Wide 9',
 'DEs aligned wide outside the TE/tackle (9-technique). Maximizes pass rush angles. Vulnerable to inside runs since the edge is so far outside. Jim Schwartz Eagles / Lions philosophy.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_44',
 'Front: 4-4',
 'Four down linemen, four LBs, three DBs. Heavy run front. Common in high school football vs Wing-T, option, and run-first opponents.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_52',
 'Front: 5-2',
 'Five down linemen, two LBs, four DBs. Old-school heavy front. Still used in youth football and vs option-heavy opponents.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_61',
 'Front: 6-1',
 'Six down linemen, one LB, four DBs. Almost exclusive to short-yardage and goal-line — pile up bodies in the box.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_53_youth',
 'Front: 5-3 (youth)',
 'Five down linemen, three LBs, three DBs. Common youth tackle front. Stops the run when offenses run 80%+ of the time.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_62_youth',
 'Front: 6-2 (youth)',
 'Six down linemen, two LBs, three DBs. Maximally run-stuffing. Common in 8-9-year-old divisions.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_335',
 'Front: 3-3-5 (stack)',
 'Three down linemen, three LBs stacked behind, five DBs. Versatile vs spread offenses — easy to disguise blitz looks. West Virginia / TCU staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_425',
 'Front: 4-2-5 (nickel)',
 'Four down, two LBs, five DBs (with a nickel/STAR replacing a LB). Modern college base — designed for spread offenses. Strong vs the pass; can struggle vs power running teams.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_dime',
 'Front: Dime (4-1-6 or 3-2-6)',
 'Six DBs on the field. Pass-heavy package — typically 3rd-and-long or two-minute. Six DBs can cover any spread look but struggles vs the run.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'front_quarter',
 'Front: Quarter (3-1-7)',
 'Seven DBs. Prevent / ultra-passing-down package. Concedes underneath catches to keep everything in front.',
 null, null, 'seed', null, true, false),

-- ── Coverages by family ──────────────────────────────────────────
('global', null, 'scheme', 'coverage_cover_0',
 'Coverage: Cover 0 (Zero blitz)',
 'No deep safety, all DBs in pure man coverage, six or seven rushers. Maximum pressure, maximum risk — zero help if a receiver wins. Saved for clear passing downs.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_1',
 'Coverage: Cover 1 (Man Free)',
 'One free safety deep, all other DBs and a LB in man coverage. The FS reads the QB and helps deep over the top of any vertical threat. Standard man defense.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_1_robber',
 'Coverage: Cover 1 Robber',
 'Cover 1 with an extra defender (often a SS or LB) sitting in a hole at 8-12 yards reading the QB''s eyes — "robbing" digs and crossers. Punishes intermediate throws.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_1_hole',
 'Coverage: Cover 1 Hole',
 'Variant of Cover 1 where a defender (often the MLB) drops to a "hole" zone at 8-10 yards over the middle. Helps vs crossing routes and provides another underneath read for the FS.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_2',
 'Coverage: Cover 2',
 'Two safeties split the deep field into halves; five underneath defenders in zones (corners take flats, three LBs take hooks/middle). Strong vs intermediate routes and outside deep balls. Vulnerable to seams and floods.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_tampa_2',
 'Coverage: Tampa 2',
 'Cover 2 with the MLB sprinting to the deep middle to fill the seam vulnerability. Effectively a 3-deep, 4-under shell. Dungy/Kiffin Buccaneers staple. Requires an athletic MLB.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_2_man',
 'Coverage: 2-Man (Two Man Under)',
 'Two deep safeties, five underneath defenders in trail-technique man coverage. Defenders trail receivers, safeties cap everything deep. Strong vs intermediate routes; vulnerable to crossers and shallow drags.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_palms',
 'Coverage: Palms (2-Trap)',
 'Cover 2 shell pre-snap; if #2 receiver runs out (to flat), the corner traps him while the safety rotates over the top of #1. Steve Spagnuolo / Jim Johnson concept.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_3',
 'Coverage: Cover 3',
 'Three deep zones (2 corners + free safety in deep middle), four underneath defenders. Strong vs the deep ball and the run (8-man front). Vulnerable to floods and high-low concepts on the curl-flat defender.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_3_sky',
 'Coverage: Cover 3 Sky',
 'Cover 3 where the safety rotates down to the strong-side flat (replaces the corner''s deep responsibility, corner takes deep third). The "sky" call indicates safety to flat.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_3_cloud',
 'Coverage: Cover 3 Cloud',
 'Cover 3 where the corner stays on the flat (cloud roll) and the safety takes the deep third. Inverted assignment from Sky. Lets a smaller corner support the run.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_3_buzz',
 'Coverage: Cover 3 Buzz',
 'Cover 3 where the strong safety drops to a "buzz" zone (curl-flat or hole), and a LB rotates to deep middle. Disguises Cover 3 by varying who takes the deep middle.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_4',
 'Coverage: Cover 4 (Quarters)',
 'Four deep defenders (CBs + safeties) each take a quarter of the field. Three underneath. Pattern-match: defenders read route distributions and pass off. Strong vs verticals; soft underneath.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_palms_quarters',
 'Coverage: Palms / Quarters trap',
 'Match-quarters variant where a corner reads #2 (slot) — if #2 runs out, corner squats on him and safety overlaps #1. Punishes smash and quick-out concepts.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_6',
 'Coverage: Cover 6 (Split-field)',
 'Quarters to one side (typically the field side or trips side), Cover 2 to the other. Lets you match different route concepts on either side. Modern split-field response to spread.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cover_9',
 'Coverage: Cover 9',
 'Variant of Cover 3 with a rotated safety (sky or cloud) and adjusted underneath drops. Naming convention varies by system — some call any rotated 3-deep "Cover 9".',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_match_quarters',
 'Coverage: Match Quarters',
 'Quarters defenders pattern-match instead of pure-zone. Corner stays on #1 if #1 goes vertical; safety takes #2 vertical; if #2 runs short, safety joins on #1. Combines zone integrity with man matchup. Saban / Aranda staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_solo',
 'Coverage: Solo',
 'Quarters call where the safety to the trips side takes #3 vertical alone (no help on #1). Frees the backside safety to bracket the isolated #1 receiver. Trips-formation answer.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_cone',
 'Coverage: Cone',
 'Quarters call where the safety to trips reads #2 / #3 routes with specific match rules. Saban Quarters terminology.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_mable',
 'Coverage: Mable / Mod',
 'Pattern-match coverage call vs trips: match #1, match #2, match #3 with specific assignments. "Mod" / "Mable" / "Stress" terminology varies by program.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_bracket',
 'Coverage: Bracket',
 'Two defenders (typically a corner underneath and a safety over the top) bracket a single elite receiver. Forces the QB to the other targets. Common vs a clear #1 in big games.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_combo',
 'Coverage: Combo (man + zone hybrid)',
 'One side plays man, the other plays zone. Effective vs unbalanced sets like trips — bracket the strong-side concept while playing zone backside.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_press_man',
 'Coverage: Press man (technique)',
 'Defender lines up directly across the receiver at the LOS. Disrupts release timing with hand jam. Strong vs timing routes. Vulnerable to stacks/bunches (free release).',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_off_man',
 'Coverage: Off man (technique)',
 'Defender plays 5-7 yards off the receiver. Easier to defend deep; easier to react to short routes. Concedes hitches and slants. Common base technique for younger DBs.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'coverage_bail',
 'Coverage: Bail (technique)',
 'Defender shows press alignment pre-snap then bails (sprints backward) into deep coverage at the snap. Disguises Cover 3 as press man. Rotation sells the disguise.',
 null, null, 'seed', null, true, false),

-- ── Pressure / blitz packages ────────────────────────────────────
('global', null, 'scheme', 'blitz_zero',
 'Pressure: Zero blitz',
 'Bring more rushers than the offense can block (typically 6-7), all coverage in pure man with no deep safety. Saved for clear passing downs and short-yardage. Boom or bust.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_fire_zone',
 'Pressure: Fire zone (zone blitz)',
 'Bring 5 rushers (one is a non-traditional rusher: LB or DB), drop a normal pass-rusher (DE) into a short zone. 3-deep, 3-under coverage behind. Confuses QB hot reads. Dick LeBeau / Steelers staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_overload',
 'Pressure: Overload blitz',
 'Bring 4-5 rushers all from one side of the formation. Forces the offense to slide protection one way — wins the unprotected side. Common A-gap / B-gap overload.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_nickel',
 'Pressure: Nickel blitz',
 'The slot/nickel DB rushes off the edge or through an interior gap. Surprises the offense — protections often don''t account for nickel pressure. Pairs with a coverage rotation behind.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_corner',
 'Pressure: Corner blitz',
 'A cornerback rushes off the edge while another defender rotates to cover his receiver. Gives the receiver a free release — risky. Best vs immobile QBs in obvious passing situations.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_safety',
 'Pressure: Safety blitz',
 'A safety walks down or rotates into a rush lane. Effective when the offense doesn''t identify the rotated safety. Pairs with cover rotation behind.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_a_gap',
 'Pressure: A-gap blitz (mug)',
 'LBs walked up to the A-gaps pre-snap (mug look). Rushers attack inside gaps. Stresses the center — interior protection breaks down fast.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_delayed',
 'Pressure: Delayed blitz',
 'LB or DB rushes 1-2 seconds after the snap. Offense thinks they''ve identified the rush, then a free runner appears. Beats max-protect schemes.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_simulated',
 'Pressure: Simulated pressure',
 'Show a blitz pre-snap (5-6 men on the LOS), then drop most into coverage and rush only 4. Confuses protection calls without actually committing extra rushers. Modern NFL staple.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_creeper',
 'Pressure: Creeper',
 '4-man rush where one rusher is a non-traditional player (LB or DB) and one DL drops. Net 4 rushers — keeps a 7-man coverage shell. Modern Vic Fangio invention.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'blitz_three_man_rush',
 'Pressure: 3-man rush (max coverage)',
 'Only three rushers; eight defenders drop into coverage. Used in obvious passing situations to take away all options. Counts on the rush winning 1-on-1s.',
 null, null, 'seed', null, true, false),

-- ── Stunts and games ────────────────────────────────────────────
('global', null, 'scheme', 'stunt_t_t',
 'Stunt: T-T (Tackle-Tackle / Twist)',
 'Two interior linemen exchange gaps post-snap (one penetrates first to occupy a blocker, the second loops behind). Confuses interior protection. Standard pass rush game.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'stunt_e_t',
 'Stunt: E-T (End-Tackle)',
 'DE crashes inside, DT loops outside. Forces the OT to pass off the DE while opening a rush lane outside. Common pass-rush game.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'stunt_t_e',
 'Stunt: T-E (Tackle-End)',
 'DT crashes outside through the B-gap, DE loops inside. Counter to the E-T stunt. Beats a slow-footed guard.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'stunt_pirate',
 'Stunt: Pirate / X-stunt',
 'DEs cross — strong-side DE loops inside, weak-side DE loops to the strong side. Rare but disorienting; common in obvious pass downs.',
 null, null, 'seed', null, true, false),

-- ── Match philosophies ─────────────────────────────────────────
('global', null, 'scheme', 'philosophy_pattern_match',
 'Philosophy: Pattern matching',
 'Defenders begin in zone alignment but convert to man coverage on specific route distributions. Combines zone discipline with man matchup. Saban / Aranda / Fangio defenses are pattern-match heavy.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'philosophy_spot_drop',
 'Philosophy: Spot-drop zone',
 'Defenders drop to assigned spots regardless of routes, then react to the QB. Easier to teach, harder to break for big plays. Vulnerable to teams that flood specific spots.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'philosophy_tampa_2_def',
 'Philosophy: Tampa 2 defense',
 'Cover 2 base with MLB sprinting deep middle. Bend-don''t-break — keep everything in front, force long drives, rely on stops. Dungy / Kiffin / Lovie Smith.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'philosophy_46',
 'Philosophy: 46 defense',
 'Buddy Ryan''s eight-in-the-box attack. Crushes the run, blitzes constantly. Mismatched against modern spread but devastating vs power-run offenses. 1985 Bears defined it.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'philosophy_attack_43',
 'Philosophy: Attack 4-3',
 'One-gap penetration, every DL attacks a single gap. Designed to disrupt in the backfield, not read-and-react. Pete Carroll Seahawks / Wade Phillips.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'philosophy_two_gap',
 'Philosophy: Two-gap (read-and-react)',
 'DLs play head-up and control two gaps each, allowing LBs to flow free. Belichick / Crennel / Capers foundation. Requires very large, strong DLs.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'philosophy_bend_dont_break',
 'Philosophy: Bend-don''t-break',
 'Concede underneath catches and small gains; force the offense into long drives and rely on a mistake. Common Cover 3 / Tampa 2 approach. Tradeoff: no chunk plays allowed but lots of 5-yard catches.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'philosophy_disguise',
 'Philosophy: Disguise',
 'Pre-snap look intentionally lies about post-snap coverage (Cover 1 to Cover 3, single-high to two-high, blitz show with drop). Forces the QB to read post-snap rather than pre-snap. Modern defenses heavily emphasize.',
 null, null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — universal defensive schemes catalog', null
from public.rag_documents d
where d.sport_variant is null and d.topic = 'scheme'
  and (d.subtopic like 'front_%' or d.subtopic like 'coverage_%'
       or d.subtopic like 'blitz_%' or d.subtopic like 'stunt_%'
       or d.subtopic like 'philosophy_%')
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
