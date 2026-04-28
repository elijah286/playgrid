-- Coach AI KB — defensive alignment depths by role, segmented by sport
-- variant and age tier.
--
-- Why this exists: when a coach asks "how many yards past the LOS should
-- the defense be?", Cal previously fell back to general football knowledge
-- because the KB only described coverage NAMES (Cover 2, Tampa 2, etc.),
-- not the role-by-role DEPTHS that those coverages actually use. The
-- canonical depths live in src/domain/play/defensiveAlignments.ts; this
-- migration mirrors them into the KB so search_kb can return them.
--
-- Two layers of detail:
--   1. Variant-level "depth guide" entries (one per variant × age tier) —
--      the answer to the generic "how deep" question.
--   2. Coverage-specific "depth chart" entries — exact yards by role for
--      common (front, coverage) combos drawn from defensiveAlignments.ts.
--
-- Age-tier convention (from migration 0167):
--   tier1_5_8   — first-year / ages 5-8 / Pee Wee
--   tier2_9_11  — ages 9-11 / 1-2 yrs experience / younger middle school
--   tier3_12_14 — middle school / 2-4 yrs experience
--   tier4_hs    — high school+ / varsity
--   null        — universal across tiers

-- Idempotency note: this migration was first applied by hand via
-- PostgREST because the operator's network blocked Postgres TCP at the
-- time. The rows below are already in the live DB. If `supabase db push`
-- later picks this migration up as "needs to run," it will fail on
-- duplicate inserts — drop those rows first or skip the migration in
-- supabase_migrations.schema_migrations. Future hand-applies should
-- prefer adding ON CONFLICT DO NOTHING (requires a unique constraint
-- we don't currently have on rag_documents).

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, age_tier,
  source, source_note,
  authoritative, needs_review
) values

-- ── Variant-level depth guides (the most common search hit) ──────────

-- Flag 5v5 — all tiers (same field size, NFL Flag-style). Field is small,
-- defenders sit close.
('global', null, 'scheme', 'defense_align_depth_flag_5v5',
 'Defensive alignment depth — Flag 5v5',
 'Flag 5v5 has 5 defenders on a narrow field (typically 25 yds wide), so depths are TIGHT relative to tackle football. Canonical alignment depths by role:\n\n' ||
 '• Flat defenders (FL/FR) — 4 yds off the LOS. Close enough to undercut quick-game (slants, hitches, quick outs); deep enough to read the QB''s shoulders.\n' ||
 '• Outside zone defenders / Corners — 8-10 yds off in zone (bail responsibility on deep thirds/halves). Press 0-1 yd in pure man (Cover 0/1).\n' ||
 '• Free safety / single-high — 12 yds off (the deep-middle eraser). On a 25-yd field this is essentially the back line — defend everything over the top.\n\n' ||
 'In MAN coverage (Cover 1/0): underneath defenders match receivers at 5 yds off, FS at 12. The closer field forces tighter spacing — the safety can''t play 15 yds deep without giving up the entire short field.\n\n' ||
 'NFL Flag rule context: 4-second QB count means quick game wins. Defending tight (4-5 yds) on underneath defenders is the standard counter — be close enough to flag the receiver right after the catch.',
 'flag_5v5', null, null,
 'seed', 'mirrored from defensiveAlignments.ts F5_COVER_3 / F5_COVER_1', true, false),

-- Flag 7v7 — youngest tier (tier1_5_8). Smaller, slower kids → shallower
-- safeties, tighter underneath.
('global', null, 'scheme', 'defense_align_depth_flag_7v7_tier1',
 'Defensive alignment depth — Flag 7v7 (ages 5-8)',
 'Flag 7v7 with first-year / ages-5-8 athletes. Throws are short (rarely past 15 yds), so depths COMPRESS toward the LOS — playing deep at this age leaves the entire short field open.\n\n' ||
 '• Flat defenders (FL/FR) — 3-4 yds off. Tight to react to bubbles and quick outs.\n' ||
 '• Hook defenders (HL/HR/M) — 4-5 yds off the LOS, in front of LBs. Mirror the QB.\n' ||
 '• Cornerbacks — 6-8 yds off in zone (a true 11-yd Cover 3 corner is too deep at this age — the QB can''t throw there).\n' ||
 '• Free safety / single-high — 8-10 yds off (NOT 13 — at this age throws don''t go that far).\n\n' ||
 'Coaching point: at this age, "defending deep" means 8-10 yds, not 12-15. Push the safety up to 8 in Cover 1 / Cover 3 — they''ll have plenty of time to get over the top of any throw the QB can actually make. Anything deeper just concedes easy underneath completions.',
 'flag_7v7', null, 'tier1_5_8',
 'seed', 'derived from F7_COVER_3 / F7_COVER_1, scaled down for tier1 throw distance', true, false),

-- Flag 7v7 — tier2_9_11 (most common 7v7 youth team).
('global', null, 'scheme', 'defense_align_depth_flag_7v7_tier2',
 'Defensive alignment depth — Flag 7v7 (ages 9-11)',
 'Flag 7v7 with ages 9-11 / 1-2 yrs experience. Quarterbacks at this tier can throw 20-25 yds, so depths sit BETWEEN the youngest tier and middle school. Canonical alignment depths by role:\n\n' ||
 '• Flat defenders (FL/FR) — 4 yds off the LOS. Defend bubbles, arrows, quick outs.\n' ||
 '• Hook defenders (HL/HR/M) — 5 yds off. Read the QB''s eyes; rally to the closest threat.\n' ||
 '• Cornerbacks (Cover 3 deep thirds, Cover 4 quarters) — 9-11 yds off the LOS in zone. Squat at 5 yds in Cover 2.\n' ||
 '• Free safety / single-high (Cover 1, Cover 3) — 11-12 yds off, centered.\n' ||
 '• Two-high safeties (Cover 2, Cover 4) — 11-12 yds off, split halves at x ≈ ±7.\n\n' ||
 'Tampa 2 special case: the middle hook (M) plays a yard deeper (6 yds) so they can carry the seam runner up the field — that''s the route Tampa 2 is built to defend.',
 'flag_7v7', null, 'tier2_9_11',
 'seed', 'mirrored from defensiveAlignments.ts F7_* alignments', true, false),

-- Flag 7v7 — tier3_12_14 (middle school — full-strength alignment).
('global', null, 'scheme', 'defense_align_depth_flag_7v7_tier3',
 'Defensive alignment depth — Flag 7v7 (middle school, ages 12-14)',
 'Flag 7v7 at middle school level. QBs can stretch the field 30+ yds, so depths are at full alignment. Canonical depths by role:\n\n' ||
 '• Flat defenders (FL/FR) — 4 yds off the LOS in Cover 3. Cushion to read and react; close enough to undercut slants and quick game.\n' ||
 '• Hook / curl defenders (HL/HR/M) — 5 yds off (6 for Tampa 2''s middle hook, who carries the seam).\n' ||
 '• Cornerbacks in deep zone (Cover 3 thirds, Cover 4 quarters) — 11 yds off. In Cover 2 they squat at 5 yds.\n' ||
 '• Free safety / single-high — 12-13 yds deep, centered.\n' ||
 '• Two-high safeties — 12 yds deep, split halves at x ≈ ±7.\n' ||
 '• Man coverage (Cover 1): underneath defenders match at 5 yds; FS deep-middle at 13.\n\n' ||
 'These match the canonical alignments the play editor draws when you call the scheme by name. The 4-second QB count in 7v7 still favors quick game, but at this age the deep ball is real — don''t shrink the safety in.',
 'flag_7v7', null, 'tier3_12_14',
 'seed', 'mirrored verbatim from defensiveAlignments.ts F7_* alignments', true, false),

-- Flag 7v7 — tier4_hs (HS / varsity — same as MS but corners can press deeper).
('global', null, 'scheme', 'defense_align_depth_flag_7v7_tier4',
 'Defensive alignment depth — Flag 7v7 (high school+)',
 'Flag 7v7 at HS+ level. QBs can throw 35+ yds, so the deep secondary aligns at full depth. Same canonical depths as middle school, with two HS-specific tweaks:\n\n' ||
 '• Flat defenders — 4 yds off.\n' ||
 '• Hook defenders — 5-6 yds off (older players can read and break faster, so a yard deeper is fine).\n' ||
 '• Cornerbacks in deep zone — 11-12 yds off. HS corners can also play press at 0-1 yd in Cover 1 / Cover 0 because they have the speed to recover.\n' ||
 '• Single-high safety — 13 yds deep.\n' ||
 '• Two-high safeties — 12-13 yds deep, split halves at x ≈ ±7.\n\n' ||
 'HS coaches frequently rotate post-snap (Cover 3 → Cover 1, Cover 2 → robber) — pre-snap depth at 12 yds gives the safety enough cushion to disguise either rotation. Anything shallower telegraphs intent.',
 'flag_7v7', null, 'tier4_hs',
 'seed', 'mirrored from F7_* with HS-specific press allowance', true, false),

-- Tackle 11 — tier2_9_11 (Pop Warner / younger youth football).
('global', null, 'scheme', 'defense_align_depth_tackle_11_tier2',
 'Defensive alignment depth — Tackle 11 (ages 9-11)',
 'Tackle 11-on-11 at the Pop Warner / 9-11 youth level. The field is full-size but throw distances are shorter than HS, so depths sit between youth-flag and HS-tackle. Canonical depths by role:\n\n' ||
 '• Defensive line (DE/DT/NT) — 1 yd off the LOS. Standard 4-point or 3-point stance.\n' ||
 '• Linebackers (Will, Mike, Sam) — 3-4 yds off (slightly tighter than HS to be in the run game).\n' ||
 '• Outside linebackers walked out / edge — 2-3 yds off when on the edge.\n' ||
 '• Cornerbacks (zone) — 5-6 yds off (Cover 3 deep third) or squat 4 yds (Cover 2). At this age a true 11-yd Cover 3 corner gives up too much underneath.\n' ||
 '• Strong safety in robber/box — 8-9 yds.\n' ||
 '• Free safety / single-high — 10-12 yds deep.\n' ||
 '• Split safeties (Cover 2 / Cover 4) — 10-12 yds, halves at x ≈ ±8.\n\n' ||
 'Run-heavy reality: most youth tackle is run-first. LBs at 3-4 yds and a SS rolled to 8-9 give you 8 in the box without sacrificing pass coverage. Don''t play deep safeties at HS depths (15 yds) — the run reaches them too late.',
 'tackle_11', null, 'tier2_9_11',
 'seed', 'derived from T11_* alignments, scaled for youth throw distance', true, false),

-- Tackle 11 — tier3_12_14 (middle school).
('global', null, 'scheme', 'defense_align_depth_tackle_11_tier3',
 'Defensive alignment depth — Tackle 11 (middle school)',
 'Tackle 11-on-11 at middle school (ages 12-14). Approaches HS depths but tighter LB box vs the run. Canonical depths:\n\n' ||
 '• Defensive line — 1 yd off the LOS.\n' ||
 '• Linebackers (Will/Mike/Sam) — 4 yds off in standard 4-3 / 3-4 looks.\n' ||
 '• Outside linebackers on the edge (3-4 OLB) — 2-3 yds off.\n' ||
 '• Cornerbacks — 5-6 yds off (zone Cover 3 deep third, Cover 2 squat). 6 yds in Cover 4 quarters.\n' ||
 '• Strong safety (single-high looks) — half-rolled at 8-9 yds (robber/SS in Cover 3); deeper at 12 yds in true 2-high.\n' ||
 '• Free safety — 12-13 yds deep, centered for single-high; 12 yds halves for 2-high.\n\n' ||
 'These match the play editor''s default Cover 3 alignment for tackle_11.',
 'tackle_11', null, 'tier3_12_14',
 'seed', 'mirrored from T11_43_OVER_COVER_3', true, false),

-- Tackle 11 — tier4_hs (high school / NFHS).
('global', null, 'scheme', 'defense_align_depth_tackle_11_tier4',
 'Defensive alignment depth — Tackle 11 (high school+)',
 'Tackle 11-on-11 at HS+ / varsity. Full-distance depths matching most HS playbooks. Canonical depths by role:\n\n' ||
 '• Defensive line (DE 5-techs, DT 1- and 3-techs, NT) — 1 yd off the LOS.\n' ||
 '• Linebackers — 4-5 yds off (Will, Mike, Sam in 4-3; ILBs in 3-4).\n' ||
 '• Outside linebackers on the edge (3-4 OLBs, 46 Bear edge) — 2-3 yds off.\n' ||
 '• Cornerbacks — 6 yds off in standard zone (Cover 3 thirds, Cover 4 quarters), 5 yds squat in Cover 2, press 0-1 yd in Cover 1 / Cover 0.\n' ||
 '• Nickel / STAR over slot — 5 yds.\n' ||
 '• Strong safety in single-high — 9 yds (robber depth, half-rolled).\n' ||
 '• Strong safety walked into the box (46 Bear, run-heavy looks) — 3 yds.\n' ||
 '• Free safety / single-high — 13 yds deep, centered.\n' ||
 '• Split safeties (Cover 2 / Cover 4) — 11-13 yds deep, halves at x ≈ ±7-8.\n\n' ||
 'Pre-snap rotation: a single-high safety at 13 yds gives enough cushion to rotate to either Cover 2 or Cover 1 post-snap without telegraphing. These are the depths the play editor uses for the canonical 4-3 Over / Cover 3 default.',
 'tackle_11', null, 'tier4_hs',
 'seed', 'mirrored verbatim from T11_43_OVER_COVER_3 / T11_NICKEL_425_COVER_4 / T11_46_BEAR_COVER_1', true, false),

-- ── Coverage-specific depth charts (exact role-by-role) ──────────────
-- Drawn from defensiveAlignments.ts so the KB matches what the editor draws.

('global', null, 'scheme', 'defense_depth_flag_7v7_cover_3',
 'Depth chart — Flag 7v7 Cover 3',
 'Canonical Flag 7v7 Cover 3 depths (matches the play editor''s default):\n\n' ||
 '• FL / FR (flat defenders) — y = 4 yds, x ≈ ±10.\n' ||
 '• HL / HR (hook defenders) — y = 5 yds, x ≈ ±4.\n' ||
 '• CB (deep third corners) — y = 11 yds, x ≈ ±12.\n' ||
 '• FS (deep middle third) — y = 13 yds, x = 0.\n\n' ||
 'Three-deep, four-under shell. Defends 4-verts well; vulnerable to flood / sail concepts that overload one underneath defender.',
 'flag_7v7', null, null,
 'seed', 'verbatim from F7_COVER_3', true, false),

('global', null, 'scheme', 'defense_depth_flag_7v7_cover_2',
 'Depth chart — Flag 7v7 Cover 2',
 'Canonical Flag 7v7 Cover 2 depths:\n\n' ||
 '• CB (squat corners) — y = 5 yds, x ≈ ±12.\n' ||
 '• HL / HM / HR (three hooks) — y = 5 yds, x ≈ -5 / 0 / +5.\n' ||
 '• FS / SS (split-half safeties) — y = 12 yds, x ≈ ±7.\n\n' ||
 'Two-deep, five-under. Vulnerable to seams (gap between safeties) and 4 verts.',
 'flag_7v7', null, null,
 'seed', 'verbatim from F7_COVER_2', true, false),

('global', null, 'scheme', 'defense_depth_flag_7v7_tampa_2',
 'Depth chart — Flag 7v7 Tampa 2',
 'Canonical Flag 7v7 Tampa 2 depths — like Cover 2 but the middle hook plays deeper to defend the seam:\n\n' ||
 '• CB (squat corners) — y = 5 yds, x ≈ ±12.\n' ||
 '• HL / HR (outside hooks) — y = 5 yds, x ≈ ±5.\n' ||
 '• M (middle hook — carries the seam) — y = 6 yds, x = 0. KEY DIFFERENCE: deeper than the outside hooks so the M can run with a vertical slot.\n' ||
 '• FS / SS (split-half safeties) — y = 12 yds, x ≈ ±7.\n\n' ||
 'The deeper Mike (middle hook) is the whole point of Tampa 2 vs Cover 2 — closes the seam window that Cover 2 leaves open.',
 'flag_7v7', null, null,
 'seed', 'verbatim from F7_TAMPA_2', true, false),

('global', null, 'scheme', 'defense_depth_flag_7v7_cover_1',
 'Depth chart — Flag 7v7 Cover 1 (man + free safety)',
 'Canonical Flag 7v7 Cover 1 depths:\n\n' ||
 '• CB (outside corners on outside WRs) — y = 5 yds, x ≈ ±12. Press 0-1 yd is also legal at HS+.\n' ||
 '• NB (nickel / slot defenders) — y = 5 yds, x ≈ ±6.\n' ||
 '• LB (inside man on RB / inside slot) — y = 4 yds, x = 0.\n' ||
 '• SS (matched on TE/extra slot) — y = 6 yds, x ≈ +4.\n' ||
 '• FS (single-high free safety) — y = 13 yds, x = 0.\n\n' ||
 'Six in man, one deep middle. Best vs spread sets where you have a clear matchup edge.',
 'flag_7v7', null, null,
 'seed', 'verbatim from F7_COVER_1', true, false),

('global', null, 'scheme', 'defense_depth_flag_5v5_cover_3',
 'Depth chart — Flag 5v5 Cover 3',
 'Canonical Flag 5v5 Cover 3 depths (narrow field, compressed shell):\n\n' ||
 '• FL / FR (flat defenders) — y = 4 yds, x ≈ ±7.\n' ||
 '• CB (deep third corners) — y = 10 yds, x ≈ ±10.\n' ||
 '• FS (deep middle third) — y = 12 yds, x = 0.\n\n' ||
 '5v5 fields are typically 25 yds wide, so the deep third defenders sit closer in than 7v7. The FS at 12 yds is essentially the back line — defend everything over the top.',
 'flag_5v5', null, null,
 'seed', 'verbatim from F5_COVER_3', true, false),

('global', null, 'scheme', 'defense_depth_flag_5v5_cover_1',
 'Depth chart — Flag 5v5 Cover 1 (man + free safety)',
 'Canonical Flag 5v5 Cover 1 depths:\n\n' ||
 '• CB (outside man) — y = 5 yds, x ≈ ±8.\n' ||
 '• NB (slot man) — y = 5 yds, x ≈ ±3.\n' ||
 '• FS (single-high) — y = 12 yds, x = 0.\n\n' ||
 'Four in man underneath, one deep middle. The narrow 5v5 field makes man coverage easier — less ground for any defender to cover horizontally.',
 'flag_5v5', null, null,
 'seed', 'verbatim from F5_COVER_1', true, false),

('global', null, 'scheme', 'defense_depth_tackle_11_43_cover_3',
 'Depth chart — Tackle 11 / 4-3 Over Cover 3',
 'Canonical Tackle 11 4-3 Over Cover 3 depths (the most common HS / youth base):\n\n' ||
 '• DE (5-techs, weak + strong) — y = 1 yd, x ≈ ±8.\n' ||
 '• DT (1-tech NT, weak A-gap) — y = 1 yd, x ≈ -2.\n' ||
 '• DT (3-tech, strong B-gap) — y = 1 yd, x ≈ +3.\n' ||
 '• Will (weak inside LB) — y = 4.5 yds, x ≈ -5.\n' ||
 '• Mike (middle LB) — y = 4.5 yds, x = 0.\n' ||
 '• Sam (strong LB, walked toward TE) — y = 4.5 yds, x ≈ +6.\n' ||
 '• CB (deep thirds, both sides) — y = 6 yds, x ≈ ±16.\n' ||
 '• SS (half-rolled robber) — y = 9 yds, x ≈ +6.\n' ||
 '• FS (single-high free safety) — y = 13 yds, x = 0.\n\n' ||
 'Three deep, four under, four-man rush. Most common HS base. Run support: SS rotates down on play-action.',
 'tackle_11', null, null,
 'seed', 'verbatim from T11_43_OVER_COVER_3', true, false),

('global', null, 'scheme', 'defense_depth_tackle_11_43_cover_2',
 'Depth chart — Tackle 11 / 4-3 Over Cover 2',
 'Canonical Tackle 11 4-3 Over Cover 2 depths:\n\n' ||
 '• DE (5-techs) — y = 1 yd, x ≈ ±8.\n' ||
 '• DT (1- and 3-tech) — y = 1 yd, x ≈ -2 / +3.\n' ||
 '• Will / Mike / Sam (LBs) — y = 4.5 yds, x ≈ -5 / 0 / +6.\n' ||
 '• CB (squat corners — Cover 2 trademark) — y = 5 yds, x ≈ ±16.\n' ||
 '• FS / SS (split-half safeties) — y = 13 yds, x ≈ ±8.\n\n' ||
 'Two deep, five under. Vulnerable to seams and any 4-vert concept that splits the safeties.',
 'tackle_11', null, null,
 'seed', 'verbatim from T11_43_OVER_COVER_2', true, false),

('global', null, 'scheme', 'defense_depth_tackle_11_34_cover_1',
 'Depth chart — Tackle 11 / 3-4 Cover 1',
 'Canonical Tackle 11 3-4 Cover 1 depths:\n\n' ||
 '• DE (4i / 5-techs) — y = 1 yd, x ≈ ±5.\n' ||
 '• NT (0-tech) — y = 1 yd, x = 0.\n' ||
 '• OLB (weak edge) — y = 2.5 yds, x ≈ -10.\n' ||
 '• Inside LBs — y = 4.5 yds, x ≈ ±3.\n' ||
 '• OLB (strong edge) — y = 2.5 yds, x ≈ +10.\n' ||
 '• CB (man on outside WRs) — y = 6 yds, x ≈ ±16.\n' ||
 '• SS (man on TE/slot) — y = 6 yds, x ≈ +6.\n' ||
 '• FS (single-high) — y = 13 yds, x = 0.\n\n' ||
 'Five-down 3-4 with one safety deep, six in man. OLBs bring the rush from the edge.',
 'tackle_11', null, null,
 'seed', 'verbatim from T11_34_COVER_1', true, false),

('global', null, 'scheme', 'defense_depth_tackle_11_nickel_quarters',
 'Depth chart — Tackle 11 / Nickel (4-2-5) Cover 4 (Quarters)',
 'Canonical Tackle 11 Nickel Cover 4 / Quarters depths:\n\n' ||
 '• DE (5-techs) — y = 1 yd, x ≈ ±8.\n' ||
 '• DT (1- / 3-tech) — y = 1 yd, x ≈ -2 / +3.\n' ||
 '• Mike / Will (only two LBs in nickel) — y = 4.5 yds, x ≈ -3 / +4.\n' ||
 '• NB (nickel / STAR over strong slot) — y = 5 yds, x ≈ +9.\n' ||
 '• CB (quarters — 4 deep) — y = 6 yds, x ≈ ±16.\n' ||
 '• FS / SS (deep quarters) — y = 11 yds, x ≈ ±7.\n\n' ||
 'Four deep, three under, four-man rush. Best vs 11-personnel passing teams. Pattern-match style — quarters defenders read the slots.',
 'tackle_11', null, null,
 'seed', 'verbatim from T11_NICKEL_425_COVER_4', true, false);


-- Revisions row for each new doc.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — defensive alignment depths (variant + age tier)', null
from public.rag_documents d
where d.topic = 'scheme'
  and (
    d.subtopic like 'defense_align_depth%'
    or d.subtopic like 'defense_depth_%'
  )
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
