-- Coach AI KB — fill gaps in the offensive-formation catalog so Cal can
-- ground its diagram-drawing in real definitions rather than guessing.
--
-- Coaches asked "build me a basic spread offense" for a tackle_11
-- playbook and Cal drew Pro I — because there was no `formation_spread`
-- entry for tackle_11 to retrieve. The defensive side has explicit
-- structural definitions in src/domain/play/defensiveAlignments.ts;
-- this migration brings the offensive side up to parity by adding the
-- common formations that were missing per variant.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Tackle 11 — fill the gaps ────────────────────────────────────

('global', null, 'scheme', 'formation_spread',
 'Tackle 11 — Formation: Spread',
 'Umbrella term — NOT a single fixed look. Modern Spread = QB in shotgun, 0-1 backs in the backfield, 3-5 receivers spread across the field. Common variants: Spread Doubles (2x2, 1 back), Spread Trips (3x1, 1 back), Spread Empty (5 wide, 0 backs). What it is NOT: Pro I, Singleback with TE-heavy sets, or any look with 2+ backs in the backfield. The point is to force the defense to declare and to spread defenders thin, then attack with quick-game, RPOs, or one-on-one matchups. When a coach says "spread" and doesn''t specify, default to Doubles (2x2) for younger teams (simplest reads) or Trips (3x1) for older teams.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_doubles',
 'Tackle 11 — Formation: Doubles (2x2)',
 'Spread variant: QB in shotgun (~5 yds back), 1 RB beside the QB, 2 receivers on each side of the formation. 5 OL on the line. Balanced look — defense can''t cheat coverage strength. Pairs with Mesh, Y-Cross, four verticals, RPO bubbles. Foundation Spread set for most college and modern HS offenses.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_pro_i',
 'Tackle 11 — Formation: Pro I',
 'I-formation variant with 2 WRs split (one each side), 1 TE on the line of scrimmage, FB at ~4 yds, HB at ~7 yds directly behind FB. QB under center. Power-running base with downhill lead blocks; play-action threat off run action. Distinguished from Singleback by having BOTH backs in the backfield. NOT to be confused with Spread — Pro I has 2 backs and a QB under center, the opposite of a spread look.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_wishbone',
 'Tackle 11 — Formation: Wishbone',
 'Three backs in the backfield: FB at ~4 yds directly behind QB, two HBs split slightly outside FB at ~6 yds (forming a Y / bone). QB under center. 2 TEs typical. Triple-option base — option pitch back, option dive back, QB keeps. Heavy run formation; almost no passing threat. Rare at modern HS but common in service-academy and traditional youth offenses.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_t',
 'Tackle 11 — Formation: T-formation (Full House)',
 'Three backs side-by-side on one row behind the QB (FB centered, two HBs flanking) at ~4 yds. QB under center. 2 TEs / 0-1 WRs. Old-school power formation; foundational to American football before the I-form took over. Modern usage: short-yardage and goal-line packages. Distinguished from Wishbone by having all three backs at the SAME depth (a flat row vs. a Y-shape).',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_bunch',
 'Tackle 11 — Formation: Bunch',
 'Three receivers clustered tightly together to one side of the formation (within ~3 yds of each other), 1 isolated WR backside, 1 RB. QB usually in shotgun. Creates natural rubs / pick action vs man coverage; floods a quarter of the field vs zone. Common variant: bunch + slot to the same side for a 4-strong look. Pairs with mesh, smash, and snag concepts.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Flag 7v7 — fill spread + trips gaps ──────────────────────────

('global', null, 'scheme', 'formation_spread',
 'Flag 7v7 — Formation: Spread',
 'Umbrella term — QB in shotgun (~3-5 yds back), 5 skill players spread out, no traditional RB in a tight backfield. Common variants for 7v7: Doubles (2x2 with a center), Trips (3x1), Empty (4x1 or 3x2 with no back). Most 7v7 offenses live in some form of Spread because the field is wide and the count favors the offense. Defaults to Doubles for younger teams unless the coach asks for a specific variant.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips',
 'Flag 7v7 — Formation: Trips (3x1)',
 'QB in shotgun, center on the ball, 3 skill players stacked to one side and 1 isolated to the other. Stretches the defense horizontally and forces a coverage rotation. Pairs with bubble screens, flood concepts, and isolation routes for the backside X. Common in 7v7 because the wider field rewards horizontal stress.',
 'flag_7v7', null, 'seed', null, true, false),

-- ── Flag 5v5 — add trips ─────────────────────────────────────────

('global', null, 'scheme', 'formation_trips',
 'NFL Flag 5v5 — Formation: Trips (3x0)',
 'QB at the snap point, center on the ball, all 3 skill players stacked to one side. Backside is intentionally empty — defense has to either rotate to the trips side (creating a 1-on-0 read for the QB) or stay balanced (creating a 3-on-2 numbers advantage for the offense). Quick-game pairings: snag, flood, smash. Common in 5v5 NFL Flag where the field is narrow and overload concepts hit fast.',
 'flag_5v5', null, 'seed', null, true, false);

-- Mirror to revisions for change history.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — fill formation gaps (spread, doubles, pro_i, wishbone, t, bunch for tackle_11; spread+trips for 7v7; trips for 5v5)', null
from public.rag_documents d
where d.subtopic in (
  'formation_spread','formation_doubles','formation_pro_i','formation_wishbone',
  'formation_t','formation_bunch','formation_trips'
)
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
