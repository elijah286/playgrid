-- Coach AI KB — Tackle 11-man common offensive plays (shared, sanctioning_body=NULL).
-- Universal across Pop Warner, AYF, NFHS. League-specific concept restrictions
-- (e.g. youth leagues banning certain blocking schemes) tagged as separate chunks.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Formations ───────────────────────────────────────────────────
('global', null, 'scheme', 'formation_i',
 'Tackle 11 — Formation: I-formation',
 'QB under center, fullback ~4 yards deep, tailback ~7 yards deep directly behind FB. 2 WRs, 1 TE. Power running base — downhill lead blocks, play-action off run action. Best for teams with a workhorse RB and a blocking FB.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_singleback',
 'Tackle 11 — Formation: Singleback (Ace)',
 'QB under center, single RB ~7 yards deep, 1 TE, 3 WRs (or 2 WR + 2 TE). Balanced run/pass — defense cannot key on FB direction. Common base for high school spread-to-run offenses.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_shotgun',
 'Tackle 11 — Formation: Shotgun',
 'QB lined up 5 yards behind center, RB beside him. Faster passing setup — QB has full field vision before the snap. Pairs with spread (3-4 WRs) for pass-first offenses or with TE/H-back for RPO games.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_pistol',
 'Tackle 11 — Formation: Pistol',
 'QB 4 yards behind center (between under-center and shotgun), RB directly behind him. Preserves downhill running angles while giving the QB a shotgun-like view. Popular in option and zone-read offenses.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips',
 'Tackle 11 — Formation: Trips (3x1)',
 'Three receivers stacked to one side, single receiver backside. Stresses defensive coverage rules — forces a coverage rotation or leaves the backside isolated. Pairs with bubble screens, smash, and flood concepts.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_empty',
 'Tackle 11 — Formation: Empty (5-wide)',
 'No backs in the backfield, 5 eligible receivers spread across the field. Pure passing look — forces defense to declare coverage. Vulnerable to interior pressure since there''s no RB to chip or block.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Run concepts ─────────────────────────────────────────────────
('global', null, 'scheme', 'play_inside_zone',
 'Tackle 11 — Play: Inside zone',
 'Backside-blocked zone run. Linemen step playside, double-team the playside DT, and climb to linebackers. RB takes a slight cutback path, reading the first down lineman to the backside of the center — bang/bend/bounce. Foundation run for most modern offenses.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_outside_zone',
 'Tackle 11 — Play: Outside zone (stretch)',
 'All five linemen lateral-step playside, attempting to outflank the front. RB aims for the outside hip of the playside tackle and reads the first down lineman: cut up if the edge is sealed, bounce outside if not. Demands athletic linemen.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_power',
 'Tackle 11 — Play: Power (gap scheme)',
 'Backside guard pulls and kicks out the playside edge. Playside linemen down-block. RB follows the puller through the B-gap. Tough-yard run — good in short-yardage and goal-line situations.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_counter',
 'Tackle 11 — Play: Counter (GT/GH)',
 'Two backside players (typically the backside guard and tackle, or guard and H-back) pull. RB takes a counter step away then follows the pullers. Misdirection forces the defense to flow the wrong way.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_zone_read',
 'Tackle 11 — Play: Zone read',
 'Inside zone for the RB; QB reads the unblocked backside DE. If DE crashes the RB, QB pulls and runs the edge. If DE stays home, QB hands off. Forces the DE to defend two players with one body.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_jet_sweep',
 'Tackle 11 — Play: Jet sweep',
 'A receiver in full motion takes a quick handoff/pitch behind the LOS at the snap, sweeping wide. Gets the ball to the perimeter fast. Often used as a packaged play with inside zone or RPO.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_iso',
 'Tackle 11 — Play: Iso (isolation)',
 'I-formation lead run. Linemen down-block their gaps, fullback leads through the hole, RB follows. Smash-mouth football — works against undisciplined linebackers.',
 'tackle_11', null, 'seed', null, true, false),

-- ── Pass concepts ────────────────────────────────────────────────
('global', null, 'scheme', 'play_four_verts',
 'Tackle 11 — Play: 4 Verts',
 'Four receivers run vertical routes, stretching the defense deep across all four quarters of the field. QB reads the safeties: split safeties = throw the seam, single high = throw the outside numbers. Beats Cover 2 and single-high looks.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_smash',
 'Tackle 11 — Play: Smash',
 'High-low concept on the outside: outside receiver runs a 5-yard hitch (low), inside receiver runs a corner route (high). QB reads the cornerback: jump the hitch = throw corner; sit on the corner = throw hitch. Beats Cover 2.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_mesh',
 'Tackle 11 — Play: Mesh',
 'Two receivers run shallow crossing routes, brushing past each other ~4 yards downfield. Natural rub. RB releases to the flat as a check-down. Beats man coverage; finds zone holes against zone.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_curl_flat',
 'Tackle 11 — Play: Curl-flat',
 'Outside WR runs a 12-yard curl, slot/RB runs a flat. High-low on the flat defender. Reliable third-and-medium concept against any coverage with a defender responsible for the flat.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_stick',
 'Tackle 11 — Play: Stick',
 'Trips concept: #1 runs a fade/clear-out, #2 runs a stick (5-yard hook), #3 runs a flat. QB reads the flat defender — flat = throw stick; stick = throw flat. Quick-game staple.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_y_cross',
 'Tackle 11 — Play: Y-Cross',
 'TE/inside receiver runs a deep crossing route at ~15 yards, paired with a high (post) and a low (flat) on the same side. Triangle stretch — beats man and zone equally. Staple of West Coast and Air Raid offenses.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_flood',
 'Tackle 11 — Play: Flood (sail)',
 'Three routes at three depths to one side: deep (post/go), medium (sail/out), short (flat). Forces a single underneath defender to choose. Beats Cover 3.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_levels',
 'Tackle 11 — Play: Levels',
 'Two crossing dig routes at different depths (typically 6 yards and 12 yards) on the same side. High-low on the underneath linebacker. Andrew-Luck-era Colts staple.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_slants',
 'Tackle 11 — Play: Slants',
 'Quick 3-step drop, receivers run 3-step slants inside. Beats press man (receiver wins with inside leverage) and Cover 2 (slant fits between underneath defenders). Staple of every offense.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_screen',
 'Tackle 11 — Play: Screen (RB or WR)',
 'QB drops as if to pass, linemen briefly engage then release into space. Ball thrown short to RB or WR with blockers in front. Counters aggressive pass rushes and blitzes.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_play_action',
 'Tackle 11 — Play: Play-action pass',
 'Fake a run, then throw. Pulls linebackers and safeties forward, opening intermediate windows. Most effective when the defense has been respecting the run game. Pairs with deep posts, crossers, and tight end seams.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_rpo_glance',
 'Tackle 11 — Play: RPO — inside zone / glance',
 'Run-pass option: line blocks inside zone, slot WR runs a glance (skinny post). QB reads the playside linebacker — if he flows to the run, throw the glance; if he drops into coverage, hand off. Modern staple.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'scheme', 'play_rpo_bubble',
 'Tackle 11 — Play: RPO — inside zone / bubble',
 'Inside zone with a bubble screen attached. QB reads the slot defender — if he widens to cover the bubble, hand off; if he sits inside, throw the bubble. Easy answer to defenses that don''t defend the perimeter.',
 'tackle_11', null, 'seed', null, true, false);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — tackle 11 shared plays (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'tackle_11'
  and d.sanctioning_body is null
  and d.topic = 'scheme'
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
