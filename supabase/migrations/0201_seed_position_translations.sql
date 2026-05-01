-- Coach AI KB — position-name translation across game types and systems.
--
-- 0161 already seeded per-variant position labels (X/Y/Z/H/F/B in tackle,
-- Q/C/X/Y/Z/H/R in flag 7v7, etc.). What was MISSING was the cross-variant
-- TRANSLATION layer — when a coach says "Y", "slot", "split end", or
-- "11-personnel", Cal needs to translate without asking.
--
-- This migration fills that gap with six new entries:
--   conventions_position_translations    — universal letter-meaning table
--   conventions_position_systems         — Air Raid vs West Coast vs Pro-style
--   conventions_personnel_groupings      — 11/12/21/13-personnel
--   conventions_slot_role_cross_variant  — what "slot" means everywhere
--   conventions_numeric_vs_letter        — when leagues use #1/#2/#3
--   conventions_offensive_line           — OL labels, gap vs zone numbering

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, age_tier,
  source, source_note,
  authoritative, needs_review
) values

('global', null, 'scheme', 'conventions_position_translations',
 'Position translations — what each letter means across game types',
 'Cal''s cross-variant translation table. When a coach uses any of these terms, translate without asking — the canonical mapping is below. ' ||
 E'\n\n' ||
 'OFFENSIVE SKILL POSITIONS:' || E'\n' ||
 '• X — Tackle: split end (backside, on the LOS, away from the TE). Flag 7v7/5v5: outside receiver, typically backside. Across all variants X is the "anchor backside WR".' || E'\n' ||
 '• Y — Tackle: tight end (TE), on the LOS next to the tackle. Flag 7v7: inside slot or 2nd outside WR depending on staff. Flag 5v5/4v4: typically the middle/slot eligible. **Cross-variant rule of thumb: in tackle Y = TE; in flag Y = an inside or middle eligible receiver.**' || E'\n' ||
 '• Z — Tackle: flanker (playside, off the LOS, on the TE side). Flag 7v7/5v5: outside receiver, typically frontside (opposite X).' || E'\n' ||
 '• H — Tackle: H-back / move TE / off-the-line hybrid (often the 4th eligible, used to motion or stay attached). Flag 7v7: a 4th-skill / move tag. Some staffs use "U" interchangeably for the move TE.' || E'\n' ||
 '• F — Tackle: fullback (in I-form behind the QB; ahead of the HB). Flag: rare; sometimes a backfield motion man.' || E'\n' ||
 '• B / R — Tackle: tailback / running back (the I-form HB or shotgun back). Flag 7v7: a backfield/RB-style motion player; otherwise rarely used.' || E'\n' ||
 '• QB / Q — Quarterback. Universal across variants. On diagrams the label often shortens to "Q".' || E'\n' ||
 '• C — Center. Universal where snapping exists.' || E'\n\n' ||
 'OFFENSIVE LINE (tackle 11 only):' || E'\n' ||
 '• LT / LG / C / RG / RT — left tackle, left guard, center, right guard, right tackle. Some staffs use "T" / "G" generically with side qualifier ("playside T", "backside G").' || E'\n\n' ||
 'DEFENSIVE LABELS:' || E'\n' ||
 '• Tackle: M (Mike — middle LB), W (Will — weak inside LB), S (Sam — strong / outside LB), CB, FS (free safety), SS (strong safety), NB / Star (nickel).' || E'\n' ||
 '• Flag 7v7: CB, FS, SS, M (middle hook), HL/HR (left/right hook), FL/FR (left/right flat), W (Will), N/NB (nickel/slot DB).' || E'\n' ||
 '• Flag 5v5: CB (corner), FS (single-high safety), NB / N (slot/nickel), FL/FR (flats in zone), Rusher (in 1-rush variants).' || E'\n\n' ||
 'TRANSLATION SHORTCUTS coaches use:' || E'\n' ||
 '• "Slot" = inside receiver. In tackle that''s typically the H or 2nd-from-sideline (Y in 11-personnel can be inline or slot). In flag, "slot" = the inside Y or H.' || E'\n' ||
 '• "Tight end" / "TE" = Y in tackle. In flag there''s no true TE; Y is just an eligible receiver.' || E'\n' ||
 '• "Split end" = X in tackle. The on-the-line outside receiver to the weak side.' || E'\n' ||
 '• "Flanker" = Z in tackle. The off-the-line outside receiver to the strong side.' || E'\n' ||
 '• "H-back" / "U" / "move TE" = H in tackle. A versatile attached/detached player.' || E'\n\n' ||
 'When the coach uses any of these terms in any variant, MAP to the canonical letter for THIS variant before drawing. Never ask "do you mean X or Y?" — pick the most common interpretation for the variant in the playbook context, draw it, and only ask if there''s genuine ambiguity (e.g. they said "the slot" in 11-personnel where slot could mean either H or Z depending on alignment).',
 null, null, null,
 'seed', 'cross-variant translation table — fills the gap above 0161 per-variant entries', true, false),

('global', null, 'scheme', 'conventions_position_systems',
 'Position labels by offensive system (Air Raid vs West Coast vs Pro-style vs Spread)',
 'The same letter can mean different things in different offensive systems. Most coaches stay close to the canonical mapping (see conventions_position_translations), but Cal should recognize system-specific deltas:' || E'\n\n' ||
 '**West Coast (Walsh / Shanahan / 49ers tree):**' || E'\n' ||
 '• X / Z / Y / F / R — split end / flanker / tight end / fullback / RB. CANONICAL.' || E'\n' ||
 '• "F" specifically = fullback. The H-back position is more associated with Joe Gibbs / Pro-style.' || E'\n' ||
 '• Heavy use of 21-personnel and 22-personnel; "F" is on the field most snaps.' || E'\n\n' ||
 '**Pro-style (Gibbs / Belichick-Erhardt-Perkins / NFL base):**' || E'\n' ||
 '• X / Z / Y / H / F / B — same canonical letters; H ("H-back" / move TE) is its own role.' || E'\n' ||
 '• 11-personnel default (1 RB, 1 TE, 3 WR). H typically off the line.' || E'\n\n' ||
 '**Air Raid (Mike Leach / Hal Mumme / Mumme tree):**' || E'\n' ||
 '• 4 WR base set: Y (inside-strong), H (inside-weak), X (outside-weak/split end), Z (outside-strong/flanker).' || E'\n' ||
 '• "Y" in Air Raid is an INSIDE receiver, NOT a TE. This is the key difference vs Pro-style.' || E'\n' ||
 '• 10-personnel base (1 RB, 0 TE, 4 WR). No fullback. Often no on-line TE — Y is a slot.' || E'\n' ||
 '• Concepts named (Mesh, Y-Cross, Stick, 4 Verts, Y-Sail) rather than tree-numbered.' || E'\n\n' ||
 '**Spread (Urban Meyer / Chip Kelly / RPO-heavy):**' || E'\n' ||
 '• Hybrid — typically uses Air Raid letters when 4-wide (Y/H inside, X/Z outside) but switches to Pro-style when 11-personnel (Y becomes TE again).' || E'\n' ||
 '• Read keys, not positions, drive most calls. Position labels are looser.' || E'\n\n' ||
 '**Coryell / vertical Pro-style:**' || E'\n' ||
 '• Tree-numbered routes (0-9). Position labels canonical (X/Y/Z/H/F/B).' || E'\n\n' ||
 'WHEN TO ASK FOR CLARITY:' || E'\n' ||
 'If the playbook''s sport_variant is tackle_11 and the coach uses "Y" without context, default to TIGHT END (Pro-style). If the system is Air Raid (the playbook''s name or notes mention it, or the coach references mesh/y-cross/stick), interpret "Y" as the INSIDE-STRONG slot. Don''t ask the coach to clarify their system — read the surrounding signals.',
 null, null, null,
 'seed', 'system-driven label nuance — Air Raid Y ≠ Pro-style Y', true, false),

('global', null, 'scheme', 'conventions_personnel_groupings',
 'Personnel groupings — what 11/12/21/13/10-personnel mean',
 'Personnel grouping notation: a 2-digit number where the first digit = RBs and the second = TEs. The remaining bodies (out of 5 eligibles in tackle 11) are WRs. Universal across HS/college/NFL.' || E'\n\n' ||
 '• **10 personnel** — 1 RB, 0 TE, 4 WR. Air Raid base. Spread base.' || E'\n' ||
 '• **11 personnel** — 1 RB, 1 TE, 3 WR. The most common modern personnel (HS, college, NFL). Pro-style + most spread defaults.' || E'\n' ||
 '• **12 personnel** — 1 RB, 2 TE, 2 WR. Heavy / play-action / two-back-pass-friendly. Common HS run-game personnel.' || E'\n' ||
 '• **13 personnel** — 1 RB, 3 TE, 1 WR. Goal line / heavy. Rare except in short-yardage packages.' || E'\n' ||
 '• **20 personnel** — 2 RB, 0 TE, 3 WR. Spread with two backs (typical of split-back power-spread).' || E'\n' ||
 '• **21 personnel** — 2 RB, 1 TE, 2 WR. I-form base. Classic two-back pro-style.' || E'\n' ||
 '• **22 personnel** — 2 RB, 2 TE, 1 WR. Power-run / play-action heavy. Dominant in old-school West Coast and any Pro-style team that wants to run it down.' || E'\n' ||
 '• **23 personnel** — 2 RB, 3 TE, 0 WR. Goal line / short yardage extreme. Two TEs flexed and one inline + 2 backs.' || E'\n\n' ||
 'EMPTY (00 / 01 / 02): no RB on the field — QB plus 4 or 5 receivers. "Empty" is the spoken term; in personnel notation it''s 00 (no RBs, no TEs, 5 WR).' || E'\n\n' ||
 'WHEN A COACH SAYS "show me an 11-personnel concept" or "draw a 12-look" — Cal should immediately know the personnel ratio without asking. Combine with the formation name (Trips, I-form, Pistol, Empty) to draw the diagram. Do not ask "what''s 11-personnel?" — translate it: 1 RB, 1 TE, 3 WR.',
 'tackle_11', null, null,
 'seed', 'tackle football personnel nomenclature — universal HS/college/NFL', true, false),

('global', null, 'scheme', 'conventions_slot_role_cross_variant',
 'What "slot" means across game types',
 'The "slot" receiver is the most ambiguous position term in football because it''s a SPATIAL role, not a fixed letter. Cal should translate without asking based on the variant + formation context.' || E'\n\n' ||
 '**Tackle 11:**' || E'\n' ||
 '• "Slot" = any inside-of-#1 eligible receiver in a 2+ WR alignment to one side.' || E'\n' ||
 '• In 11-personnel trips: the slot is typically Z or H (not Y inline; Y becomes inline TE).' || E'\n' ||
 '• In 11-personnel 2x2 (Pro): slot is the inside receiver to the strong side (often H if H is detached).' || E'\n' ||
 '• In Air Raid 10-personnel: Y AND H are both slots. The default "slot" term in Air Raid usually means Y (inside-strong).' || E'\n\n' ||
 '**Flag 7v7:**' || E'\n' ||
 '• Slot = inside receiver. In a trips look, the inside-most player. In 2x2, the inside player on either side.' || E'\n' ||
 '• Most common label: Y (or H if the variant uses H).' || E'\n\n' ||
 '**Flag 5v5:**' || E'\n' ||
 '• Slot = the middle-aligned eligible (when 3 receivers are split L/M/R). Label varies — Y, "M", or numeric "2" depending on staff.' || E'\n' ||
 '• If the formation is 2x1, the slot is the inside receiver on the 2-side.' || E'\n\n' ||
 '**Flag 4v4:**' || E'\n' ||
 '• Often no "slot" — typically only 3 eligibles. The middle eligible serves the slot role functionally.' || E'\n\n' ||
 'WHEN A COACH SAYS "the slot" — figure out which player they mean from context (formation + variant) and draw it. Don''t ask "do you mean Y or H?" — pick the inside-most receiver in the called formation. If they meant something different they''ll correct you.',
 null, null, null,
 'seed', 'cross-variant slot translation', true, false),

('global', null, 'scheme', 'conventions_numeric_vs_letter',
 'Numeric vs letter labeling — when leagues use 1/2/3 instead of X/Y/Z',
 'Some leagues — especially youth flag at the tier1_5_8 / tier2_9_11 level — use NUMERIC labels (#1, #2, #3) or DIRECTIONAL labels (Left, Middle, Right) instead of position letters. Cal should accept both and translate.' || E'\n\n' ||
 '**Numeric — outside-in counting:**' || E'\n' ||
 '• #1 = the OUTERMOST receiver to a side (closest to the sideline). On a left side trips look: #1 is the leftmost.' || E'\n' ||
 '• #2 = the next-inside receiver.' || E'\n' ||
 '• #3 = the third-from-sideline (only exists in trips/quads).' || E'\n' ||
 '• **NUMBERS COUNT FROM SIDELINE IN, not from formation strength.** This is the universal football convention; both sides have a #1, #2, #3.' || E'\n' ||
 '• Coaches use it to talk about coverage rules ("CB takes #1, S takes #2 vertical").' || E'\n\n' ||
 '**Directional — Left/Middle/Right:**' || E'\n' ||
 '• Common in youth flag (tier1_5_8) and recreational leagues where coaches don''t teach letters.' || E'\n' ||
 '• "Left receiver" / "right slot" / "middle eligible" — translate to whichever letter the playbook uses.' || E'\n\n' ||
 '**By variant:**' || E'\n' ||
 '• Tackle 11 — letters dominate (X/Y/Z/H/F/B); numeric appears in defensive coverage discussion.' || E'\n' ||
 '• Flag 7v7 — letters in HS+ programs; numeric/directional in tier1/2 youth.' || E'\n' ||
 '• Flag 5v5 — mixed; many staffs use L/M/R for the 3 eligibles.' || E'\n' ||
 '• Flag 4v4 — directional dominates (left/middle/right).' || E'\n\n' ||
 'TRANSLATION RULE: when a coach uses numbers, mentally map: #1 = X (outside-weak) / Z (outside-strong), #2 = inside-of-#1 (Y or slot), #3 = inside-of-#2 (H in trips). When they use directional words, place the player at that field position with the letter the playbook normally uses.',
 null, null, null,
 'seed', 'numeric / directional → letter translation', true, false),

('global', null, 'scheme', 'conventions_offensive_line',
 'Offensive line labeling and gap conventions (tackle 11)',
 'Offensive lineman labels and the gap-naming system Cal uses when describing run concepts and protections.' || E'\n\n' ||
 '**Lineman labels (left-to-right standard):**' || E'\n' ||
 '• LT — Left Tackle (the QB''s blindside in a right-handed QB''s base).' || E'\n' ||
 '• LG — Left Guard.' || E'\n' ||
 '• C — Center (snaps the ball; on the LOS).' || E'\n' ||
 '• RG — Right Guard.' || E'\n' ||
 '• RT — Right Tackle.' || E'\n\n' ||
 'Some staffs use generic "T" / "G" qualified by side ("playside T", "backside G", "frontside G").' || E'\n\n' ||
 '**Gap naming (between OL):**' || E'\n' ||
 '• A-gap — between center and guard (both sides have an A-gap; "weak A" or "strong A").' || E'\n' ||
 '• B-gap — between guard and tackle.' || E'\n' ||
 '• C-gap — between tackle and TE (or where the TE would be).' || E'\n' ||
 '• D-gap — outside the TE / outside receiver.' || E'\n\n' ||
 '**Defensive technique numbering (across from the OL):**' || E'\n' ||
 '• 0-tech — head-up on the center.' || E'\n' ||
 '• 1-tech — shaded to the weak shoulder of the center (in the weak A-gap).' || E'\n' ||
 '• 2-tech — head-up on the guard.' || E'\n' ||
 '• 3-tech — outside shoulder of the guard (in the B-gap).' || E'\n' ||
 '• 4-tech — head-up on the tackle.' || E'\n' ||
 '• 5-tech — outside shoulder of the tackle (in the C-gap).' || E'\n' ||
 '• 7-tech / 9-tech — outside shoulder of the TE / outside the TE.' || E'\n\n' ||
 'When a coach says "we run inside zone" — that''s an A-gap-aiming run. "Outside zone" — the back aims for the C-gap and reads through. "Power" — pulls the backside guard through the strong A. "Counter" — pulls the BSG and TE/H through the weakside C.' || E'\n\n' ||
 'No flag variants use OL gap nomenclature meaningfully; this is tackle-only.',
 'tackle_11', null, null,
 'seed', 'OL labels + gap + technique numbering — tackle football fundamentals', true, false);


-- Revisions row for each new doc.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — position-name translations across game types', null
from public.rag_documents d
where d.topic = 'scheme'
  and d.subtopic like 'conventions_%'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
