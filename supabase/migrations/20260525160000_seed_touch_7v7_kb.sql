-- Coach AI KB — Touch 7v7 rules + conventions.
--
-- Touch football (specifically 7v7 touch) is composition-identical to flag
-- 7v7 — same roster, same field, same concepts, same defenses. The
-- DIFFERENCE lives in the rules: two-hand-touch instead of flag-pull, no
-- flag belt equipment, different penalty list, different tackle-mechanic
-- terminology. This migration seeds the rules KB so Cal can answer
-- touch-specific questions while the composition pipeline reuses
-- flag_7v7's catalog (concept skeletons, defensive templates, etc.).
--
-- Sections:
--   A. Touch-specific rules        (~10)
--   B. Touch vs flag differences   (~5)
--   C. Touch-specific strategy     (~5)
--   D. Touch league variants       (~5)

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ─────────────────────────────────────────────────────────────────
-- A. Touch-specific rules
-- ─────────────────────────────────────────────────────────────────

('global', null, 'rules', 'overview',
 'Touch 7v7 — Overview',
 'Touch football is the contact-based cousin of flag — instead of pulling a flag belt, a defender ends the play by making a two-hand touch on the ball-carrier between the shoulders and the knees. Otherwise the game is structurally identical to 7v7 flag: 7 players per side, forward-pass focus, no live blocking on passes (legal screen leverage only). Common at high-school + adult rec leagues; less common at the youth tier-1 level where flag dominates.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'two_hand_touch',
 'Touch 7v7 — Two-hand touch rule',
 'A defender ends a play by making a clean two-hand touch on the ball-carrier between the shoulders and the knees. Single-hand touches don''t count (this prevents one-handed swipes that miss). Touches must be DELIBERATE — incidental brushing while running past the carrier doesn''t end the play. The official''s call is final, but in most rec leagues the carrier acknowledges legitimate touches without protest.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'no_flag_belt',
 'Touch 7v7 — Equipment: No flag belts',
 'Touch leagues do NOT use flag belts. Players wear standard athletic gear (mouth guards strongly recommended, cleats or turf shoes). Some leagues require all teammates to wear matching jerseys (or alternating dark/light) so officials can tell who''s offense vs defense — flag belts traditionally fulfill that role, so touch teams compensate with jerseys.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'pass_rush',
 'Touch 7v7 — Pass rush',
 'Same as flag 7v7: one designated rusher per play from a fixed distance (typically 7 yards behind the LOS). The rusher must wait until the snap and may not contact offensive players beyond an open-hand "shed" (no holding, no tackling). Touch leagues vary: some allow unlimited rushers, some allow no rush at all — verify your league''s rule.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'no_blocking',
 'Touch 7v7 — Blocking rule',
 'No physical blocking — same as flag. Offensive players may not initiate contact with defenders. Legal LEVERAGE (positioning your body between a defender and the ball-carrier without contact) is allowed on screens and crossing routes; deliberate contact is flagged as offensive pass interference or illegal blocking (10-yard penalty + loss of down).',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'field',
 'Touch 7v7 — Field dimensions',
 'Standard 7v7 field: 40 yards long × 25-30 yards wide, with two 10-yard end zones. Line to gain typically at midfield (3-4 downs to cross, then 3-4 downs to score). Some leagues use a full football field if available (53 wide, 100 long) but the 40×25 short field is the dominant rec/HS-7v7 setup.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'downs',
 'Touch 7v7 — Downs and line to gain',
 'Most common: 4 downs to cross midfield (line to gain), 4 more downs to score. No punts. Failure = turnover at the spot. Some leagues use 3-and-3, faster pace.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'scoring',
 'Touch 7v7 — Scoring',
 'Standard 7v7: TD = 6, PAT 1pt from 5y, PAT 2pt from 10y (drop-back pass), defensive INT-for-TD = 6, defensive PAT-return on 2pt try = 2. Tie-breakers vary by league — most rec keep regular-season ties; tournaments do single-possession overtime from a short distance.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'no_run_zones',
 'Touch 7v7 — No-run zones',
 'Most touch 7v7 leagues retain the flag-style no-run zones: typically the last 5 yards before each end zone are no-run zones (designed runs are illegal — the offense must pass). Encourages passing in scoring position and prevents power-running schemes from dominating the red zone.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'snap',
 'Touch 7v7 — Snap',
 'Snap is between the legs from the center to a QB standing 1-3 yards back (shotgun). The center is an ELIGIBLE receiver immediately after the snap — same as flag 7v7. Some leagues allow the QB to take a direct snap from the ground (no center) in a 4-1 or 5-0 formation.',
 'touch_7v7', null, 'seed', null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- B. Touch vs flag differences (cross-reference)
-- ─────────────────────────────────────────────────────────────────

('global', null, 'rules', 'vs_flag_summary',
 'Touch 7v7 — Differences from flag 7v7',
 'Composition is identical (same 7-player roster, same field, same concepts, same defenses). Differences: (1) Touch ends with a two-hand touch instead of a flag pull — no flag belts; (2) No "flag guarding" penalty (the equivalent in touch is "hindering the defender" but it''s called less often); (3) Some touch leagues allow more aggressive defensive shedding (open-hand jam at the LOS) than flag does; (4) Touch tolerates incidental contact better than flag — bumps during routes are usually let go.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'vs_flag_penalty_diffs',
 'Touch 7v7 — Penalty differences from flag',
 'Penalty list mostly mirrors flag 7v7 with these differences: NO flag guarding (replaced by "obstructing the touch" — runner can''t use arms/ball to block a touch attempt; 5-10 yds); NO illegal flag removal (defenders can''t pull flags because there are none); NEW "premature touch" — defender touches the carrier before they have control of the ball (5 yds, replay); OFFENSIVE PASS INTERFERENCE called more strictly because incidental contact is less common in touch.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'vs_flag_contact',
 'Touch 7v7 — Contact tolerance vs flag',
 'Touch is the "more physical" cousin of flag. Defenders can use open-hand jams at the LOS, can deflect routes by getting in the way (without grabbing), and can make incidental contact while chasing without penalty. Flag is stricter — any defender contact with a receiver pre-pass is a penalty. Touch coaches teach: hands up, ride the receiver, force the QB to throw over you. Doesn''t work in flag.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'vs_flag_terminology',
 'Touch 7v7 — Terminology differences',
 'Touch carries different vocabulary in a few places: "flag pull" → "touch" or "tag"; "flag belt" → no equivalent (no belts worn); "flag guarding" → "obstruction" or "hindering"; "down by flag pull" → "touched down" (which is confusing because it''s NOT a touchdown — context matters). Most other football terminology (slant, post, Cover 2, etc.) is shared between flag and touch.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'vs_flag_when_each',
 'Touch 7v7 — When to use touch vs flag',
 'Flag dominates youth (5U-14U) because (a) the visual feedback of the pulled flag teaches body control and defender positioning, and (b) flag belts are cheap and adjustable. Touch dominates high-school+ rec and adult leagues because (a) the absence of a belt eliminates a piece of equipment to manage, and (b) experienced players don''t need the flag-visual to know when they''ve been "tackled." High-school programs sometimes use touch in PE classes to introduce football concepts without contact gear.',
 'touch_7v7', null, 'seed', null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- C. Touch-specific strategy
-- ─────────────────────────────────────────────────────────────────

('global', null, 'tactics', 'vs_man_touch_7v7',
 'Touch 7v7 — Strategy: Beating man with touch rules',
 'Same concept catalog as flag (mesh, stack/bunch picks, isolation), but the more-permissive contact rule lets defenders ride routes — your WR breaks may not get the same clean separation. Counter: use HARD breaks (60° cuts instead of soft 45°), sell every stem hard, and motion to identify man vs zone before the snap. Mesh + bunch sets still work but the rub element is less reliable because defenders can stay close legally.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_zone_touch_7v7',
 'Touch 7v7 — Strategy: Beating zone',
 'Same as flag 7v7 — find the holes between defenders, overload a zone (flood), sit routes in the open windows. The touch contact rule doesn''t materially change zone strategy because defenders aren''t close enough to a receiver to leverage the rule.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'tactics', 'defender_technique_touch',
 'Touch 7v7 — Coaching: DB technique for touch',
 'Touch lets DBs do what flag does not: jam receivers at the LOS, ride them downfield with an open hand on the hip, deflect their stem. Coach this AGGRESSIVELY because most touch DBs play it like flag (no contact) and give up free releases. The defensive depth chart is decided by who learns the jam first.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'tactics', 'wr_technique_touch',
 'Touch 7v7 — Coaching: WR technique for touch',
 'Touch WRs need stronger releases than flag WRs because DBs can legally ride them. Drill: speed releases, head-fake-and-go, two-step jab releases. WRs who can defeat a jam at the LOS dominate touch leagues — same as receivers in contact football. Most flag-transition WRs underestimate the difference and lose to physical DBs all season until they retool their release work.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'tactics', 'qb_quick_game_touch',
 'Touch 7v7 — Strategy: QB quick game',
 'Quick game (slants, hitches, smoke screens) is even more valuable in touch than in flag because the more-permissive defensive contact means deep routes take longer to develop. A 1-second slant or 2-second hitch beats coverage every time. Touch QBs should drill rhythm throws — set, plant, throw — until automatic.',
 'touch_7v7', null, 'seed', null, true, false),

-- ─────────────────────────────────────────────────────────────────
-- D. Touch league variants
-- ─────────────────────────────────────────────────────────────────

('global', null, 'rules', 'league_high_school_touch',
 'Touch 7v7 — High school 7v7 touch programs',
 'Many states run a high-school 7v7 touch program in the summer offseason for skill-position development (QBs, WRs, DBs). NFHS doesn''t sanction touch as a competitive sport, but state-level coaching associations do. Rules align with NFL FLAG 7v7 most often: rush from 7y, no blocking, two-hand touch, 4 downs to midfield. Used for skill development, not contact training.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'league_intramural_touch',
 'Touch 7v7 — College intramural touch',
 'College intramural leagues are the highest concentration of touch 7v7 in the US. Rules vary by school but typical: 7v7, no blocking, two-hand touch, 4 downs to midfield + 4 to score, 40-minute games. Co-ed leagues require a balance of male/female players in the route distribution (e.g., every other play must target a female eligible).',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'league_adult_rec_touch',
 'Touch 7v7 — Adult rec touch leagues',
 'Adult rec 7v7 touch (USFTL, IFAF affiliates) uses the most "competitive" version: rush from 7y on every play, two-hand touch enforced strictly, 4-down sets, 40×30 fields. Officiating tighter than youth touch — incidental contact still called. Common entry point for ex-high-school football players who want to keep playing without contact gear.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'league_pe_touch',
 'Touch 7v7 — PE-class touch',
 'Many K-12 PE classes teach football fundamentals via touch (no flag belts to manage, no contact pads). Rules are heavily simplified: no rush, every player must touch the ball once per game (round-robin QB), focus on running, catching, throwing. Not a competitive format — designed purely for skill exposure.',
 'touch_7v7', null, 'seed', null, true, false),

('global', null, 'rules', 'league_variants_summary',
 'Touch 7v7 — Comparing leagues',
 'Quick reference: NFL FLAG-affiliated touch (HS+adult) uses 7-yard rush, 4-down sets, 40×30 field. USFTL touch is similar with slightly tighter officiating. College intramural is most variable — read your school''s rulebook. PE class is no-rush, no-score. State-level HS programs follow whichever ruleset their state coaching association adopts (most align with NFL FLAG).',
 'touch_7v7', null, 'seed', null, true, false);

-- Revisions
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Touch 7v7 KB seed — rules, vs-flag differences, strategy, league variants', null
from public.rag_documents d
where d.sport_variant = 'touch_7v7'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
