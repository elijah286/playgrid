-- Coach AI KB — Player & play-call conventions per game type.
--
-- Topic = 'conventions'. Subtopics:
--   * offense_labels  — single-letter labels (X/Y/Z/H/W/F/T/Q/C/R/...)
--   * defense_labels  — DL techniques, LB tags (M/S/W), DB labels
--   * receiver_numbering — #1/#2/#3 from sideline in (defensive count)
--   * formation_terms — strength, direction, motion call shorthand
--
-- These chunks describe how players are typically REFERENCED in playbooks
-- and play calls for each variant — what a coach means when they say
-- "Z motion" or "the 3-tech" or "#2 vertical".
--
-- All chunks are authoritative=false / needs_review=true so admins can
-- verify and refine. Conservative phrasing — variants between leagues and
-- staffs are flagged in the chunk.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ══════════════════════════════════════════════════════════════════
-- TACKLE 11 (NFHS / Pop Warner / AYF — shared core conventions)
-- ══════════════════════════════════════════════════════════════════

('global', null, 'conventions', 'offense_labels',
 'Tackle 11 — Offensive personnel labels (X / Y / Z / H / F / T / Q)',
 'Standard 11-personnel single-letter labels used in most American football playbooks: Q = quarterback; C = center; G = guard (LG/RG); T = tackle (LT/RT); X = backside split end (single-receiver side, on the line); Z = playside flanker (off the line, opposite X); Y = tight end (on the line, attached to the formation); H = H-back / move TE / detached Y (off the line, often motions); F = fullback / wing / sniffer back; R or B = running back / tailback; W = slot receiver in 10/11 personnel when used. Personnel groupings name themselves by RB count + TE count — "11 personnel" = 1 RB / 1 TE / 3 WR; "12" = 1 RB / 2 TE; "21" = 2 RB / 1 TE. Some staffs swap H and F or use U for the move TE.',
 'tackle_11', null, 'seed',
 'Letter-to-role mapping varies by staff; verify against the playbook''s personnel sheet.',
 false, true),

('global', null, 'conventions', 'defense_labels',
 'Tackle 11 — Defensive personnel labels (M / S / W, DL techniques, DBs)',
 'Linebackers: M = Mike (middle), S = Sam (strong side, aligned to TE/strength), W = Will (weak side, away from strength). In 3-4 fronts the inside backers are sometimes M and J (Jack). Defensive line by Bear/Buddy Ryan technique numbers — 0 = head-up on center, 1 = inside shade of guard, 2 = head-up on guard, 3 = outside shade of guard, 4 = head-up on tackle, 4i = inside shade of tackle, 5 = outside shade of tackle, 6 = head-up on TE, 7 = inside shade of TE, 9 = outside shade of TE. Common labels: NT = nose tackle (0/1), DT = defensive tackle (3-tech), DE = defensive end (5/7), JACK/RUSH = stand-up edge. Secondary: CB = cornerback (LCB/RCB or boundary/field corner), FS = free safety, SS = strong safety, N or NB = nickel (5th DB), D or DB = dime (6th DB), $ (Money) = hybrid safety/LB in some systems.',
 'tackle_11', null, 'seed', null, false, true),

('global', null, 'conventions', 'receiver_numbering',
 'Tackle 11 — Receiver numbering #1 / #2 / #3 (defensive call shorthand)',
 'Receivers are counted from the sideline in: #1 is the outermost receiver to a side, #2 is the next inside, #3 is innermost. The TE counts as a receiver if detached or in the route distribution. Defenders use this to communicate matchups — "I''ve got #2 vertical," "lock #1," "match #3 to the flat." Numbering is independent of jersey number and resets each side of the formation.',
 'tackle_11', null, 'seed', null, false, true),

('global', null, 'conventions', 'formation_terms',
 'Tackle 11 — Formation strength, direction, and motion call terms',
 'Strength is most often called by the TE side ("Right" = TE right) or by passing strength (more receivers). Common direction tags: Right/Left, Strong/Weak, Field (wide side of the field) / Boundary (short side). Motion is named by the player moving — "Z-motion," "H-jet," "Y-shift" — plus a direction or destination ("Z-Tex" cross-formation, "Z-Zip" short to the sideline). "Trips" = 3 receivers to one side; "Doubles/Pro" = 2x2; "Empty" = no back next to the QB. Tagging conventions like "Pro Right Slot" describe RB alignment + strength + slot side and are read in sections by the offense.',
 'tackle_11', null, 'seed', null, false, true),

-- ══════════════════════════════════════════════════════════════════
-- FLAG 5v5 (NFL Flag and most rec leagues)
-- ══════════════════════════════════════════════════════════════════

('global', null, 'conventions', 'offense_labels',
 'Flag 5v5 — Offensive labels (Q, C, X, Y, Z) and "rusher" defender',
 '5v5 offense is QB + center + 3 eligibles. Standard labels: Q = quarterback; C = center (also an eligible receiver post-snap); X = outside receiver (typically backside or single-receiver side); Y = inside / slot receiver; Z = outside receiver to the other side. Some staffs label the 3 receivers simply L / M / R (left, middle, right) or 1 / 2 / 3, especially with younger players. With a back next to the QB the back is often labeled R or H. Because the QB cannot run across the LOS in NFL Flag, the formation is typically spread (no back) or has one detached H/R.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'conventions', 'defense_labels',
 'Flag 5v5 — Defensive labels (rusher, LBs, corners, safety)',
 '5v5 defense conventionally has 1 rusher + 2 underneath + 2 deep, or 0 rush + zone variants. Labels: R = rusher (must start 7 yards off the LOS in NFL Flag); CB = corners (LCB/RCB) on the outside receivers; LB or M = middle/inside underneath defender; FS or S = deep safety. In Cover 2 variants the two deep players are LS/RS or "halves." With a 0-rush look the front defender is often called Spy (mirrors QB) or Robber. Staffs that prefer numbers use 1/2/3 from sideline in to mirror the offense.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'conventions', 'receiver_numbering',
 'Flag 5v5 — Receiver numbering and matchup calls',
 'Receivers are counted from the sideline in: #1 outside, #2 inside (slot or middle). With trips to one side, #3 is the innermost. Defensive calls reference these numbers — "match #2 vertical," "wall #1," "robot the #3." Because there are at most 3 eligibles each side, numbering rarely exceeds #3.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'conventions', 'formation_terms',
 'Flag 5v5 — Formation and motion terms',
 'Common formations: Trips (3 receivers one side, 0 the other); Trey/Bunch (3 receivers tight to one side); Doubles / 2x2 (two each side); Empty (no back). Strength is typically called by receiver count or by a direction tag (Right/Left). Motion: short-name the moving receiver — "Z over," "Y orbit," "X jet." Because the field is narrower and shorter, motion timing is usually fast and the snap comes on movement, not on a settle.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ══════════════════════════════════════════════════════════════════
-- FLAG 7v7
-- ══════════════════════════════════════════════════════════════════

('global', null, 'conventions', 'offense_labels',
 'Flag 7v7 — Offensive labels (Q, C, X, Y, Z, H, R)',
 '7v7 offense is QB + center + 5 eligibles. Standard labels: Q = quarterback; C = center; X = backside split end; Z = playside flanker / outside; Y = tight slot or inside receiver; H = move slot / second slot, often the motion player; R or B = running back / dump back. Many staffs use 1/2/3/4/5 simply numbering receivers from one sideline to the other when running tournament-style installs. Variants like Pylon and OT7 use the same letters but emphasize different alignments — verify against the league install.',
 'flag_7v7', null, 'seed',
 'Sanctioning-body deltas (Pylon vs OT7) not yet seeded — labels are largely shared.',
 false, true),

('global', null, 'conventions', 'defense_labels',
 'Flag 7v7 — Defensive labels (no rush; LBs, corners, safeties)',
 '7v7 defense is typically 7 coverage defenders with no pass rush. Labels: CB = corners (LCB/RCB); N or NB = nickel / inside slot defender; M = Mike / middle hook defender; S = Sam (strong-side underneath); W = Will (weak-side underneath); FS / SS or LS / RS = deep safeties. Cover-3 variants use a single FS deep with three underneath (CB / N / M / W) and two cloud corners. Staffs frequently label by zone landmark instead — "hook," "curl-flat," "deep half" — when teaching pattern-match rules.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'conventions', 'receiver_numbering',
 'Flag 7v7 — Receiver numbering #1 / #2 / #3 (and #4 in trips/empty)',
 'Counted from the sideline inward: #1 = outside, #2 = next in, #3 = next, #4 = innermost (only present in 4x1 empty looks). Defensive checks key off the count — "trips check," "stack rules," "push #3" — because 7v7 has no run threat, every defender is in coverage and number-matching is the dominant teaching language.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'conventions', 'formation_terms',
 'Flag 7v7 — Formation and motion terms',
 'Common formations: 3x2 (Trips), 2x2 (Doubles), 4x1 (Quads/Empty), Bunch / Stack tags for tight splits. Strength is typically called by trips side or by a tag like "Right" / "Left." Motion names the player ("Z-orbit," "H-jet," "Y-trade") plus destination. Because there are no offensive linemen beyond the center, formation depth (off-ball alignments, stacks, bunches) carries more meaning than blocking strength.',
 'flag_7v7', null, 'seed', null, false, true),

-- ══════════════════════════════════════════════════════════════════
-- FLAG 4v4
-- ══════════════════════════════════════════════════════════════════

('global', null, 'conventions', 'offense_labels',
 'Flag 4v4 — Offensive labels (Q + 3 eligibles)',
 '4v4 offense is QB + 3 eligibles, often with no center (direct snap or self-snap depending on league). Labels: Q = quarterback; X = outside receiver one side; Y = inside / slot or single back; Z = outside receiver to the other side. Some leagues use simple positional names (Left, Middle, Right). Because there are only three non-QB players, role labels are often shared with motion tags — "X-jet," "Z-cross."',
 'flag_4v4', null, 'seed',
 '4v4 conventions vary widely by league — verify against the rulebook for snap rules.',
 false, true),

('global', null, 'conventions', 'defense_labels',
 'Flag 4v4 — Defensive labels',
 '4v4 defense is typically 1 rusher + 3 coverage, or 0 rush + 4 coverage. Labels: R = rusher (off-LOS minimum where required); CB = corners (left/right); M = middle/safety; or simply 1/2/3/4 counted from sideline. Cover-2 in 4v4 puts two over the top with two underneath (rare); single-high with man-to-man on the three eligibles is the most common shell.',
 'flag_4v4', null, 'seed', null, false, true),

('global', null, 'conventions', 'receiver_numbering',
 'Flag 4v4 — Receiver numbering',
 'Counted from the sideline in: #1 outside, #2 inside. With trips to one side, #3 is the innermost. With only three eligibles total, number-matching calls are short and direct ("I''ve got #1," "switch on #2 in").',
 'flag_4v4', null, 'seed', null, false, true),

('global', null, 'conventions', 'formation_terms',
 'Flag 4v4 — Formation and motion terms',
 'Common formations: Trips (3 to one side, 0 the other); 2x1 (two and one); Stack / Bunch tags for tight alignments. Strength is called by receiver count or direction. Motion is fast and almost always pre-snap; "X-over," "Z-jet," and "Y-orbit" are typical names. Field is shorter so motion lengths are measured in steps, not yards.',
 'flag_4v4', null, 'seed', null, false, true),

-- ══════════════════════════════════════════════════════════════════
-- SIX MAN
-- ══════════════════════════════════════════════════════════════════

('global', null, 'conventions', 'offense_labels',
 'Six-man — Offensive labels (Q, C, E1/E2, B-backs)',
 'Six-man offense fields 3 linemen (C + two ends) and 3 backs. Standard labels: Q = quarterback; C = center (must be present in most rulebooks); E or E1/E2 = ends (the two players flanking the center on the line — both eligible to receive a pass); B, R, or HB = backs (any of the three backfield players, often labeled L-back, R-back, M-back or simply 1, 2, 3). Note the rule: in six-man the QB cannot advance the ball past the LOS unless the ball has first been handed off or passed (the "15-yard pass-or-handoff" rule in some sanctioning bodies). Pre-snap labels often emphasize who is the "spinner" / direct snap target rather than QB vs RB.',
 'six_man', null, 'seed',
 'Six-man rules and labels vary by state association; verify with the league rulebook.',
 false, true),

('global', null, 'conventions', 'defense_labels',
 'Six-man — Defensive labels',
 'Six-man defense fields 6 players, typically 3 down + 1 LB + 2 DBs, or 2 down + 2 LB + 2 DBs ("3-1-2" or "2-2-2"). Labels: NT or N = nose / 0-tech; E = ends on the line; M = middle linebacker; CB or DB = corners / safeties. With so few defenders, players often play hybrid roles — "rover" or "spur" for a hybrid LB/safety is common. Coverage shells are mostly single-high with man underneath.',
 'six_man', null, 'seed', null, false, true),

('global', null, 'conventions', 'receiver_numbering',
 'Six-man — Receiver numbering',
 'Counted from the sideline in. Because both ends and any back can be eligible, the count includes the ends: #1 = outermost player on the line or detached, #2 = next in, etc. With a spread look it''s common to number the eligibles 1 through 5 across the formation rather than per-side. Verify against the staff''s preference.',
 'six_man', null, 'seed', null, false, true),

('global', null, 'conventions', 'formation_terms',
 'Six-man — Formation and motion terms',
 'Common formations: Spread (ends split wide, three backs spread or stacked); Trips / Empty (all three backs flexed out); Tight (ends close to the C with backs in I or T behind); Single-wing variants for power. Direction is usually called Right/Left. Motion is named by the moving back ("R-jet," "M-orbit") and is heavily used because the field is wider relative to the player count.',
 'six_man', null, 'seed', null, false, true),

-- ══════════════════════════════════════════════════════════════════
-- EIGHT MAN
-- ══════════════════════════════════════════════════════════════════

('global', null, 'conventions', 'offense_labels',
 'Eight-man — Offensive labels (Q, C, T, E, X/Z, B/H/F)',
 'Eight-man offense fields 5 linemen (C + 2 G/T + 2 ends) and 3 backs (or 4 linemen + 4 skill in spread sets). Labels: Q = quarterback; C = center; G/T = guard/tackle (when used — many 8-man systems run 3-line fronts with C + 2 ends); E = ends on the line of scrimmage (eligible); X = backside split end; Z = playside flanker; Y = tight end / wing; H = H-back / motion back; F or FB = fullback; B or R = running back. Personnel groupings collapse — a typical "21" look in 8-man is 2 backs + 1 TE + 2 split ends.',
 'eight_man', null, 'seed',
 'Eight-man rules and labels vary by state; some associations require 5 down linemen, others 3 — verify.',
 false, true),

('global', null, 'conventions', 'defense_labels',
 'Eight-man — Defensive labels',
 'Eight-man defense fields 8 players. Common fronts: 3-2-3 (3 DL, 2 LB, 3 DB), 3-3-2 (3 DL, 3 LB, 2 DB), 2-3-3 (2 DL, 3 LB, 3 DB). Labels mirror 11-man: NT = nose (0/1-tech); DE = ends; M = Mike, S = Sam, W = Will linebackers; CB = corners; FS/SS = safeties; ROVER or SPUR = hybrid 4th LB/safety. Single-high coverage with match-up rules is typical because of the wider field-to-player ratio.',
 'eight_man', null, 'seed', null, false, true),

('global', null, 'conventions', 'receiver_numbering',
 'Eight-man — Receiver numbering',
 'Counted from the sideline in: #1 outside, #2 next, #3 next. Eligible-end counting matters in 8-man — the on-line end (E or Y) counts as #1 if no one is split outside of him. Defensive calls echo 11-man — "match #2 vertical," "lock #1" — and are taught the same way.',
 'eight_man', null, 'seed', null, false, true),

('global', null, 'conventions', 'formation_terms',
 'Eight-man — Formation and motion terms',
 'Common formations: Pro (TE + flanker + split end with 2 backs); Spread (3 or 4 receivers, single back); I-form / Wing-T families with both ends tight; Empty. Strength is called by TE side or passing strength. Motion names the player ("Z-jet," "H-orbit," "F-fly"). Wing-T tags ("Buck," "Belly," "Waggle") survive into 8-man almost unchanged.',
 'eight_man', null, 'seed', null, false, true),

-- ══════════════════════════════════════════════════════════════════
-- EXTREME FLAG (Austin / regional leagues)
-- ══════════════════════════════════════════════════════════════════

('global', null, 'conventions', 'offense_labels',
 'Extreme Flag — Offensive labels (placeholder pending admin verification)',
 'Extreme Flag conventions are league-specific and not yet verified in this knowledge base. Typical labels mirror 5v5 / 7v7 NFL Flag conventions (Q = quarterback; C = center if used; X / Y / Z for the eligibles; H or R for an additional motion player) but the league rulebook may specify otherwise. Awaiting admin input from the Austin Extreme Flag rulebook.',
 'extreme_flag', null, 'seed',
 'Placeholder — admin must load real conventions from the league rulebook.',
 false, true),

('global', null, 'conventions', 'defense_labels',
 'Extreme Flag — Defensive labels (placeholder pending admin verification)',
 'Extreme Flag defensive labels are not yet verified. Typical labels follow flag conventions (R = rusher when allowed; CB = corners; M = middle LB; FS/SS for safeties), but actual conventions may differ. Awaiting admin input from the league rulebook.',
 'extreme_flag', null, 'seed',
 'Placeholder — admin must load real conventions from the league rulebook.',
 false, true);

-- ── revision rows for every chunk inserted above ──────────────────
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_url, source_note,
  authoritative, needs_review,
  change_kind, change_summary
)
select
  d.id, 1,
  d.title, d.content, d.source, d.source_url, d.source_note,
  d.authoritative, d.needs_review,
  'create', 'Initial seed — player & play-call conventions per game type.'
from public.rag_documents d
where d.topic = 'conventions'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
