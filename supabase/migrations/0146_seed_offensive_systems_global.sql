-- Coach AI KB — Universal offensive systems / philosophies (sport_variant=NULL).
-- One chunk per system, with founder/origin and core principles.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'scheme', 'system_air_raid',
 'Offensive system: Air Raid',
 'Originated by Hal Mumme and Mike Leach (Iowa Wesleyan / Valdosta State / Kentucky / Texas Tech / WSU). Core: 4-WR sets, no-huddle, six base concepts (Mesh, Y-Cross, Stick, Shallow, 4 Verts, Y-Sail) repeated to mastery. Quick game + vertical shots. QB makes the read; line uses wide splits. Repetition over volume — fewer concepts, infinite reps.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_west_coast',
 'Offensive system: West Coast',
 'Bill Walsh (Bengals/49ers). Core: short, timed passing game replaces the running game as a way to control the clock. 3-step and 5-step drops, precise route timing, ball delivered before receiver finishes the cut. Heavy use of crossing routes, slants, and option routes. Erhardt-Perkins and Coryell descendants share its DNA.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_coryell',
 'Offensive system: Coryell (Air Coryell)',
 'Don Coryell (Cardinals/Chargers, Joe Gibbs disciple). Core: vertical passing game with timed deep routes — digs, posts, deep crossers, seven-step drops. Routes called by tree numbers ("Y-stick", "X-deep"). Foundation of Mike Martz Rams and most modern vertical passing offenses.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_erhardt_perkins',
 'Offensive system: Erhardt-Perkins',
 'Ron Erhardt + Ray Perkins (1970s Patriots, perfected by Belichick/McDaniels). Core: concepts named (not numbered) so they can be called from any formation/personnel grouping. Routes adjust to formation. Famous for "Texas" (RB angle), "Sail" flood, and a small core of multi-formational concepts. Modern NFL standard.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_pro_style',
 'Offensive system: Pro-style',
 'Generic NFL-influenced offense: 21/12/11 personnel base, mix of under-center and shotgun, pro-style verbiage, dropback passing + zone/gap run game. Used by traditional college and HS programs. Lots of formation/motion variety, modest concept count, heavy emphasis on play-action.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_spread',
 'Offensive system: Spread',
 'Generic term for any 3+ WR offense in shotgun. Branches: spread-to-pass (Air Raid), spread-to-run (Urban Meyer Florida, RPO offenses), spread option (Rich Rodriguez WVU, Chip Kelly Oregon). Common thread: horizontal stretching, conflict the box defenders, exploit numbers/leverage.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_spread_option',
 'Offensive system: Spread option',
 'Spread alignment + zone-read or veer option mechanics. Rich Rodriguez (WVU/Michigan), Chip Kelly (Oregon), Urban Meyer (Florida/OSU). Core: zone-read inside zone, packaged with bubbles/glances (RPOs). QB read makes one defender wrong every play. Pace + tempo are core weapons.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_pistol',
 'Offensive system: Pistol',
 'Chris Ault (Nevada). QB lines up 4 yards behind center (between under-center and shotgun), RB directly behind QB. Preserves downhill running angles + I-formation play-action while keeping shotgun pass game. Pairs with zone-read. Adopted across HS, college, and parts of NFL.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_run_and_shoot',
 'Offensive system: Run-and-Shoot',
 'Tiger Ellison + Mouse Davis (perfected by June Jones at Hawaii / Atlanta Falcons / Detroit Lions). Core: 4 WRs, no TE, all WRs run option routes that adjust to coverage post-snap. QB and WRs read the same coverage and make the same adjustment. Open-field, pass-heavy, high-tempo.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_wing_t',
 'Offensive system: Wing-T',
 'Tubby Raymond (Delaware) classic. Core: deceptive run game with multiple ball-carrier threats (FB, halfback, wingback) on every play. Misdirection via pulling guards, traps, counters. Pairs with bootleg play-action. Common in HS football for teams with smaller, technique-driven OL.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_flexbone',
 'Offensive system: Flexbone (Triple-option)',
 'Triple-option offense from Air Force / Navy / Army / Georgia Tech (Paul Johnson). Core: QB reads the dive (FB) → keep (QB) → pitch (slot) on every play. Slotbacks block the perimeter. Demands disciplined defense — every level must take its option key. Devastating to undisciplined defenses.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_smashmouth_spread',
 'Offensive system: Smashmouth spread',
 'Modern hybrid: spread alignment + power running game (gap schemes, counter, power, RPO power). Coined for Auburn (Gus Malzahn) and TCU (Gary Patterson early-2010s). Wears down defenses with power runs from spread looks where defense expects pass.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_rpo_offense',
 'Offensive system: RPO-based offense',
 'Modern philosophy where every called play has both a run and a pass option, decided post-snap by the QB''s read of one defender. Compresses defensive responsibility — defender must be right vs both. Lincoln Riley (Oklahoma/USC) and Joe Brady (LSU 2019) defined the modern wave.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_two_back_power',
 'Offensive system: Two-back power',
 'Traditional under-center I or split-back base with a fullback as a lead blocker. Core run plays: lead iso, power, counter, dive. Play-action off the run. Used by physical HS programs and grind-it-out NFL throwbacks. Pairs well with a workhorse RB.',
 null, null, 'seed', null, true, false),

('global', null, 'scheme', 'system_air_coryell_modern',
 'Offensive system: Modern vertical (Sean McVay / Kyle Shanahan)',
 'Wide-zone running game + bootleg/play-action passing. McVay (Rams) and Shanahan (49ers) modernized Mike Shanahan''s original. Core: outside zone is the foundation; play-action off it slows down defenders; deep crossers and posts hit behind the bitten LBs. Pre-snap motion is constant — provides info and gets matchups.',
 null, null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — universal offensive systems', null
from public.rag_documents d
where d.sport_variant is null and d.topic = 'scheme'
  and d.subtopic like 'system_%'
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
