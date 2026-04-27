-- Coach AI KB — NFL Flag 5v5 strategy & tactics.
--
-- Situational decision-making (not specific plays). Down-and-distance,
-- field zones, clock, matchups, game flow.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body,
  source, source_note,
  authoritative, needs_review
) values

-- ── Down & distance ──────────────────────────────────────────────
('global', null, 'tactics', 'down_first',
 'NFL Flag 5v5 — Strategy: 1st down',
 'Take a shot. With 4 downs to gain ~12 yards (half a 25-yard zone), 1st down is the cheapest down to throw deep — even an incomplete pass leaves 2nd-and-medium. Try a vertical concept (4 verts, post-wheel) or a play-action shot. Save your high-percentage stuff for 3rd/4th.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'down_second',
 'NFL Flag 5v5 — Strategy: 2nd down',
 'Mix run and pass to keep the defense honest. If you''ve thrown deep on 1st, run jet sweep or hit a flat to grab quick yards and stay ahead of the chains. 2nd-and-long is when the defense expects pass — counter with a screen, draw, or jet motion fake.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'down_third',
 'NFL Flag 5v5 — Strategy: 3rd down',
 'Distance dictates the call. 3rd-and-short (1-3 yards): high-percentage concept like Stick or Snag. 3rd-and-medium (4-7): mesh, levels, or a spacing concept that beats both man and zone. 3rd-and-long (8+): four verts, deep dig, or a screen with a chance for YAC.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'down_fourth',
 'NFL Flag 5v5 — Strategy: 4th down (no punts)',
 'There are no punts in NFL Flag — every 4th down is a go. Two questions: (1) Distance to the line to gain — if it''s short, anything goes; if long, prefer a route that crosses the sticks (don''t throw a 3-yard hitch on 4th-and-7). (2) Field position — a 4th-down stop deep in your own territory hands the opponent a short field, so consider a safer call there.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Field zones ──────────────────────────────────────────────────
('global', null, 'tactics', 'zone_backed_up',
 'NFL Flag 5v5 — Strategy: Backed up (own 5-15 yard line)',
 'Top priority: don''t turn it over for a short field or safety. Avoid throws into your own end zone (a sack here is a safety). Lean on quick game (slants, hitches, mesh) and 1-2 yard handoffs. Get one first down to flip field position, then open up the playbook.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'zone_midfield',
 'NFL Flag 5v5 — Strategy: Approaching midfield (line to gain)',
 'You''re in or near a no-run zone. Expect the defense to drop everyone — they know you must pass. Use spacing concepts (snag, stick) and pre-snap motion to stress the zone. Don''t force a deep ball; a 5-yard completion crosses the line.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'zone_red_offense',
 'NFL Flag 5v5 — Strategy: Red zone offense (inside opponent 10)',
 'No-run zone applies inside the 5. The field shrinks — vertical routes have no room. Best concepts: snag (triangle stretch), bunch slants, fade to a height-mismatch receiver, or pick concepts (Mesh, Y-Cross) to free a man-coverage target. Settle for the 1-point conversion if a TD is contested — never force into traffic.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'zone_red_defense',
 'NFL Flag 5v5 — Strategy: Red zone defense',
 'Inside your own 5 is a no-run zone — the offense MUST pass. Drop all 5 into man-under or zone-under, taking away crossers and corners. Bracket their best receiver. Force the QB to the back line of the end zone. A turnover on downs gets you out at the spot of the foul, not at midfield.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Clock & game flow ────────────────────────────────────────────
('global', null, 'tactics', 'clock_two_minute_offense',
 'NFL Flag 5v5 — Strategy: Two-minute offense',
 'In the final two minutes the clock stops on incompletions, OOB, scores. Use the sidelines (out routes, comebacks). Run no-huddle to keep the defense from substituting. Spike to stop the clock if you have one timeout left and want to set the next call. Save at least one timeout for the end-of-half goal-line decision.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'clock_two_minute_defense',
 'NFL Flag 5v5 — Strategy: Two-minute defense',
 'Protect the deep half — a single big play loses the game. Cover 2 or Cover 3 shell, no zero blitzes. Force the offense to checkdown and march — every short completion still burns clock if your tackler pulls a flag in bounds. Make the QB throw outside the numbers, away from the safety.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'clock_burn',
 'NFL Flag 5v5 — Strategy: Killing the clock with a lead',
 'Late and ahead, prioritize plays that stay in bounds (runs, slants) and convert short yardage. Long handoffs and screens that get tackled in bounds are golden. Avoid sideline routes (clock stops on OOB). Take the full play clock between snaps. Kneel-down is legal but rare — usually a quick handoff and a flag pull burns more time than a kneel.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'clock_comeback',
 'NFL Flag 5v5 — Strategy: Trailing late',
 'Use the sidelines and middle digs. Throw aggressive — incomplete is fine, sacks are fatal (clock keeps running outside two minutes; sack ends the down without yardage). Burn timeouts only after defense converts a 1st or after a long run. Two-score deficit: chase the closest score first, then think onside-equivalent.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Matchup adjustments ─────────────────────────────────────────
('global', null, 'tactics', 'vs_press_man',
 'NFL Flag 5v5 — Strategy: Beating press man',
 'Stack and bunch formations create automatic free releases — the back receiver in a stack can''t be jammed. Slants and quick outs win timing. Double moves (slant-and-go, hitch-and-go) punish a defender who jumps the first cut. Avoid timing-dependent deep throws against a defender right in your face.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'vs_zone',
 'NFL Flag 5v5 — Strategy: Beating zone',
 'Find the seams between defenders. Spacing concepts (snag, stick, smash) put two receivers in the same zone defender''s area. Underneath crossers (mesh, drag) make zone defenders chase. Hold the QB''s eyes on one side to move the safety, then throw away from him.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'vs_double_rush',
 'NFL Flag 5v5 — Strategy: Vs heavy rush (2+ rushers)',
 'Two rushers means three coverage defenders — you have a 3-on-3 advantage on the back end. Throw quick (slant, hitch, screen) so the rush doesn''t matter. Or scheme up a 1-on-1 mismatch with motion or a stack and let your best receiver win. A QB scramble / extended throw is risky vs a fast rusher — get the ball out.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'vs_drop_five',
 'NFL Flag 5v5 — Strategy: Vs drop-5 (no rush)',
 'No rusher means a free 7 seconds — but five defenders in coverage. Move the QB (rollout, sprint-out) to shorten the field. Use the shallow cross / drag to give a defender no good drop. Patience: hit the open underneath route and let your runner make a defender miss for YAC.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Tempo & deception ──────────────────────────────────────────
('global', null, 'tactics', 'tempo_no_huddle',
 'NFL Flag 5v5 — Strategy: No-huddle tempo',
 'Run no-huddle to prevent defensive substitutions and force them to play the same coverage all drive. Especially useful when you''ve found a matchup or coverage you can exploit. Cost: less time for QB to read the defense — keep the playbook tight (3-4 calls per drive).',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'tempo_check_with_me',
 'NFL Flag 5v5 — Strategy: Check-with-me at the line',
 'Send in two plays from the sideline; QB picks based on coverage. Common pair: one play vs single-high (Cover 1/3) and one vs two-high (Cover 2). Even a simple "slants vs man, smash vs zone" check turns into easy yardage.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'trick_double_pass',
 'NFL Flag 5v5 — Strategy: Trick play — double pass',
 'QB throws a quick lateral or backward pass to a receiver, who then throws a forward pass downfield (legal — the receiver is still behind the line of scrimmage). Devastating once per game. Practice it — a thrown lateral that goes forward becomes an illegal forward pass.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

-- ── Game management ─────────────────────────────────────────────
('global', null, 'tactics', 'game_first_drive',
 'NFL Flag 5v5 — Strategy: First-drive scripting',
 'Script your first 4-6 plays to (a) probe coverages — run a route that forces the defense to declare man vs zone, (b) feature your best matchups early so you set the tone. Avoid trick plays on drive 1 — save the surprise for when you need it.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true),

('global', null, 'tactics', 'game_halftime',
 'NFL Flag 5v5 — Strategy: Halftime adjustments',
 'Two-minute halftime is short — pick ONE adjustment per side. Offense: identify the coverage they hurt you with and have an answer ready. Defense: identify the offense''s favorite concept and assign a defender to take it away. Don''t install new schemes — refine what you''re already doing.',
 'flag_5v5', 'nfl_flag', 'seed', null, false, true);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — strategy & tactics (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_5v5'
  and d.sanctioning_body = 'nfl_flag'
  and d.source = 'seed'
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
