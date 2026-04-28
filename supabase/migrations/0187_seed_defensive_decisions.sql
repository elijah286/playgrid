-- Coach AI KB — defensive decision frameworks: press vs off, leverage.
--
-- The KB previously had press/off DEFINITIONS and leverage MECHANICS but
-- no DECISION TRIGGERS — Cal couldn't answer "when should I press vs
-- stay back?" or "do you recommend inside or outside leverage for my
-- OLBs?" with KB-grounded specifics. This migration fills that gap.
--
-- All entries follow the format: SITUATION → CALL → REASONING.
--
-- Subtopic conventions:
--   defense_press_vs_off_<variant>     — press/off decision per variant
--   defense_leverage_<role>            — leverage decision by defender role
--   defense_leverage_principles        — universal framework

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, age_tier,
  source, source_note,
  authoritative, needs_review
) values

-- ── Press vs Off Coverage — Decision Triggers ────────────────────────

('global', null, 'scheme', 'defense_press_vs_off_principles',
 'Press vs Off Coverage — Decision framework (universal)',
 'When to call PRESS vs OFF coverage. The trigger isn''t a single factor — it''s a stack of conditions. Default to OFF unless three or more PRESS triggers stack:\n\n' ||
 'PRESS when:\n' ||
 '• Short yardage / red zone — limited field forces quick throws; pressing disrupts route timing in a small window.\n' ||
 '• Your CB has clear physical edge over the WR (size, speed, hand strength).\n' ||
 '• You have safety help over the top (Cover 1 robber, Cover 3 with the safety on the press side).\n' ||
 '• Opponent runs timing-based quick game (slants, hitches, quick outs) — press blows up the route at the stem.\n' ||
 '• 3rd-and-long passing situations where you want to eliminate the easy completion.\n' ||
 '• You''re trying to disguise a blitz — press signals man, distracting from the rush.\n\n' ||
 'OFF (5-8 yds) when:\n' ||
 '• Opponent has a vertical-threat WR who can win on a quick release.\n' ||
 '• Your CB is young, smaller, or coverage-iffy — give them space to read and react.\n' ||
 '• 1st-and-10 / 2nd-and-medium where the defense should be balanced vs run + pass.\n' ||
 '• No safety help over the top (Cover 0 except in pure blitz looks).\n' ||
 '• Tempo team runs uptempo — off coverage is easier to align cleanly when winded.\n' ||
 '• Wet field / bad weather — press is harder to execute when footing is sketchy.\n\n' ||
 'NEVER press when: Cover 0 with no safety AND your CB has a coverage disadvantage. That''s the surest path to a 60-yard TD.',
 null, null, null,
 'seed', 'tactical decision framework — universal across variants', true, false),

('global', null, 'scheme', 'defense_press_vs_off_flag',
 'Press vs Off Coverage — Flag football (5v5, 7v7, 4v4)',
 'In flag, "press" means alignment-only — defender lines up directly across the receiver at the LOS, but cannot make contact (NFL Flag, most youth-flag rule sets prohibit jamming). The disruption is positional/visual, not physical. Decision triggers:\n\n' ||
 'PRESS-ALIGN when:\n' ||
 '• Red zone / inside the 5 — field is shrunk, no room for double moves.\n' ||
 '• Opponent runs heavy quick-game (slants, hitches, mesh) — press alignment forces the WR to release around the defender, eating clock against the 4-second QB count.\n' ||
 '• You''ve identified a stack/bunch and want to deny the free release for the back receiver.\n' ||
 '• Cover 0 / pure man with a fast pass rush (5v5) — press pushes the route out, gives the rusher time.\n\n' ||
 'OFF (4-6 yds) when:\n' ||
 '• Vs a vertical-threat WR — give your DB cushion to flip and run.\n' ||
 '• 1st-down or 2nd-and-short where balance vs run + pass matters.\n' ||
 '• Your DB lacks recovery speed — off coverage masks that.\n' ||
 '• Cover 3 / Cover 2 zone — corners squat or bail by design; pressing breaks the shell.\n\n' ||
 'AGE-TIER NOTE: many youth flag leagues (tier1_5_8) ban any press alignment — the rule is a 1-yd cushion minimum. Default to OFF at 4-5 yds for the youngest division.',
 null, null, null,
 'seed', 'flag-specific press-vs-off decisions; covers NFL Flag rule constraints', true, false),

('global', null, 'scheme', 'defense_press_vs_off_tackle_youth',
 'Press vs Off Coverage — Tackle football (Pop Warner / youth, ages 9-13)',
 'Youth tackle: defaults to OFF coverage by a wide margin. Press is REAL contact at the line, requires a kick-step + jam technique that takes 2-3 years to develop. Most youth CBs aren''t there yet.\n\n' ||
 'PRESS only when:\n' ||
 '• Goal line / inside the 5 — pure desperation prevent.\n' ||
 '• Your CB is an experienced multi-year starter with proven press technique.\n' ||
 '• You have CLEAR safety help over the top (Cover 1, NOT Cover 0).\n' ||
 '• You''re in a known passing situation (3rd-and-long) and the WR isn''t a vertical threat.\n\n' ||
 'OFF (5-7 yds) is the default for almost every snap. Reasoning:\n' ||
 '• Youth CBs miss-time press jams routinely → easy quick-game completion or a free release deep.\n' ||
 '• Off coverage lets the CB read the QB''s shoulders and break — fundamental skill at this age.\n' ||
 '• Most youth offenses run quick game underneath; off coverage at 5 yds undercuts that effectively.\n' ||
 '• If your defender is unsure how to press cleanly, off-coverage at 5 yds is the right floor — anything else gives up too much.\n\n' ||
 'BOTTOM LINE: at this age, teach off-coverage technique first. Press is an HS+ skill.',
 'tackle_11', null, 'tier2_9_11',
 'seed', 'youth-tackle press/off — overwhelmingly off by default', true, false),

('global', null, 'scheme', 'defense_press_vs_off_tackle_hs',
 'Press vs Off Coverage — Tackle football (HS+ / varsity)',
 'HS+ adds the full press toolkit (catch press, jam press, off-press hybrid). Decision framework:\n\n' ||
 'PRESS when:\n' ||
 '• Cover 1 with a robber (FS or SS) — your safety is the eraser, press the outside.\n' ||
 '• Cover 3 to the BOUNDARY (short side) — corner has a smaller area to defend, press eats space.\n' ||
 '• Cover 0 blitz — you''re bringing pressure, press blows up the hot route.\n' ||
 '• 3rd-and-7+ pass situations vs a route-tree-only WR (not a true vertical threat).\n' ||
 '• Your CB matchup is favorable (size, speed, technique).\n\n' ||
 'OFF when:\n' ||
 '• 2-deep coverage (Cover 2, Cover 4) — corners squat at 5 yds, NOT press; pressing breaks the shell because the corner is the underneath-flat defender.\n' ||
 '• Vs a verified deep threat WR — give cushion to flip and recover.\n' ||
 '• 1st-and-10 base downs — be balanced vs run + pass.\n' ||
 '• Field side of Cover 3 (wide side) — press there means a long recovery if beaten.\n' ||
 '• Wet field / heavy rain — press footwork is unreliable.\n\n' ||
 'HYBRID (off-press / soft press, 2-3 yds) when: you want to disguise — DB starts at 2-3 yds, can press or bail post-snap based on the call. Best vs offenses that motion to dictate.',
 'tackle_11', null, 'tier4_hs',
 'seed', 'HS-tackle press/off framework; covers hybrid technique', true, false),

-- ── Defender Leverage — Decision Triggers ────────────────────────────

('global', null, 'scheme', 'defense_leverage_principles',
 'Defender Leverage — Universal principles (force toward your help)',
 'Leverage = where the defender lines up RELATIVE to the receiver, biased to take away one direction and force the route toward help. The single rule that subsumes everything: LEVERAGE IS DICTATED BY THE COVERAGE CALL — defenders take leverage that funnels the receiver toward a teammate.\n\n' ||
 'INSIDE LEVERAGE (defender lines up inside-shade of the receiver) — used when:\n' ||
 '• You have a deep middle safety (Cover 1, Cover 3) — force the receiver outside, away from the open middle, into the sideline.\n' ||
 '• You want to take away crossers, slants, and digs — anything breaking inside is your strength.\n' ||
 '• You have a flat defender outside who can rally (Cover 2 corner squatting on the flat).\n' ||
 '• Vs a slot receiver in a man scheme — inside leverage forces the seam out wide where help can converge.\n\n' ||
 'OUTSIDE LEVERAGE (defender lines up outside-shade) — used when:\n' ||
 '• You have NO deep safety (Cover 0) — force the route inside where the LBs and trash can disrupt.\n' ||
 '• Cover 2 corners playing the boundary — outside leverage funnels everything toward the safety help in the deep half.\n' ||
 '• You want to take away the fade / corner / out — anything breaking outside is your strength.\n' ||
 '• Boundary-side corner in Cover 3 — outside leverage backed by the FS pushes the route into trail technique.\n\n' ||
 'TWO RULES OF THUMB:\n' ||
 '• "Leverage to your help": if you have help inside, leverage outside. If you have help outside, leverage inside.\n' ||
 '• "Numbers tell you the call": Cover 1 / 3 = single-high = inside leverage outside corners. Cover 2 / 4 = two-high = outside leverage outside corners.',
 null, null, null,
 'seed', 'universal leverage decision framework', true, false),

('global', null, 'scheme', 'defense_leverage_corners',
 'Defender Leverage — Cornerbacks (by coverage)',
 'Cornerback leverage is dictated by the safety help behind them. Quick reference by coverage:\n\n' ||
 '• Cover 0 (no safety) — OUTSIDE leverage. No deep help means the easy route to give up is the inside slant. Force the route outside where the sideline becomes a 12th defender.\n' ||
 '• Cover 1 (single-high FS) — INSIDE leverage on outside WRs. The FS is in the deep middle; force everything outside, away from him, toward the sideline.\n' ||
 '• Cover 2 (two-deep) — OUTSIDE leverage by the squat corner; the deep-half safety is over-the-top help inside. Force comebacks and outs into the squat corner''s zone.\n' ||
 '• Cover 3 (three-deep) — INSIDE leverage on the deep-third corner. The corner has the deep third himself; force the WR outside where the sideline shortens the field.\n' ||
 '• Cover 4 / Quarters — OUTSIDE leverage. The corner reads the #1 receiver and pattern-matches; outside leverage forces inside breaks where the safety can rally.\n' ||
 '• Press man (Cover 1 press) — INSIDE leverage with INSIDE-foot up. Take away the slant, funnel the WR to the sideline.\n\n' ||
 'COMMON MISTAKE: a young corner in Cover 2 takes inside leverage out of habit. Wrong — Cover 2 corners need OUTSIDE leverage so they can squat the flat and reroute the #1 toward the safety help.',
 null, null, null,
 'seed', 'CB leverage by coverage — single most common Cal question', true, false),

('global', null, 'scheme', 'defense_leverage_olb_lb',
 'Defender Leverage — OLBs and LBs (run-fit alley + pass leverage)',
 'OLBs/LBs leverage is a run-fit + pass-coverage hybrid. Different rules apply for each phase:\n\n' ||
 'IN THE RUN GAME (alley fit):\n' ||
 '• OLBs SET THE EDGE with OUTSIDE leverage — never let the runner get outside the OLB. Force everything back inside to the pursuit.\n' ||
 '• Inside LBs (Mike, Will) play DOWNHILL through the GAP they''re assigned — leverage is gap-specific, not hash-specific.\n' ||
 '• Cover-2 OLBs play OUTSIDE-IN — outside leverage forces the run inside; the safety covers the deep cut-back.\n' ||
 '• Cover-3 alley defender (typically the SS or Will) plays INSIDE-OUT — inside leverage to fill the cutback, the corner sets the edge.\n\n' ||
 'IN PASS COVERAGE (against TEs / RBs / slot in man):\n' ||
 '• OLB on a TE in MAN — INSIDE leverage. The TE''s primary route is the seam or in-breaker; force him outside where help converges.\n' ||
 '• OLB on a RB out of the backfield — INSIDE leverage. RB''s primary route is the flat or angle-out; force him outside where the safety rotates.\n' ||
 '• Hook defender in zone (LB at 5-6 yds) — square up, no shaded leverage. Read the QB and rally to the closest threat.\n' ||
 '• Tampa 2 Mike (carrying the seam) — INSIDE leverage to wall off any inside-breaking #2 receiver.\n\n' ||
 'KEY DECISION FOR YOUR OLB: ask "what''s my biggest threat — a TE seam, an RB swing, or a run outside?" The answer dictates leverage. Run-first opponent → outside (set the edge). Pass-first → inside (take away the seam).',
 null, null, null,
 'seed', 'OLB/LB leverage — run-fit + pass coverage hybrid', true, false),

('global', null, 'scheme', 'defense_leverage_safeties_nickels',
 'Defender Leverage — Safeties and Nickels',
 'Safeties and nickels leverage flows from their role in the coverage:\n\n' ||
 'FREE SAFETY (deep middle, single-high):\n' ||
 '• Pre-snap centerfield — leverage is depth, not hash. Stay 13 yds deep, x = 0.\n' ||
 '• Read the QB; break to the throw, not to a leverage shade.\n' ||
 '• If you HAVE to commit, default to inside leverage — protecting the post route is more important than the corner because help is closer to the boundary.\n\n' ||
 'STRONG SAFETY (in robber / half-rolled / box):\n' ||
 '• Robber depth (Cover 3 SS at 9 yds) — INSIDE leverage on the #2 strong-side receiver. Read his break and rob digs/crossers.\n' ||
 '• In the box (46 Bear, run support) — leverage is gap-specific, like a LB.\n' ||
 '• Two-high deep half — OUTSIDE leverage on the #1 receiver, capping the corner. The corner has inside help; the SS has the post.\n\n' ||
 'NICKEL / STAR (slot defender):\n' ||
 '• In MAN (Cover 1) — INSIDE leverage on the slot. Force outside; the FS has the post; the SS or LB has the inside crosser.\n' ||
 '• In ZONE — square up, no shaded leverage. Read the slot release and pass off to the next zone (Cover 4 quarters).\n' ||
 '• Blitz nickel — outside leverage as you stem; you''re a rusher, not a coverage player.\n\n' ||
 'PRINCIPLE: safeties and nickels leverage the receiver toward the help they were taught to expect. If you change the coverage call, recheck the leverage — players who drift to "their" leverage from a different coverage are the most common bust source in any zone.',
 null, null, null,
 'seed', 'safety + nickel leverage by role', true, false);


-- Revisions row for each new doc (idempotent — won't duplicate).
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — defensive decision frameworks (press/off + leverage)', null
from public.rag_documents d
where d.topic = 'scheme'
  and (
    d.subtopic like 'defense_press_vs_off%'
    or d.subtopic like 'defense_leverage%'
  )
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
