-- Coach AI KB — Flag 4v4 strategy + coaching (combined into one migration).

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Strategy ─────────────────────────────────────────────────────
('global', null, 'tactics', 'first_down_4v4',
 'Flag 4v4 — Strategy: 1st down',
 'Best opportunity to take a shot — defense often plays soft on 1st. Mix in a quick game concept that''ll get 5+ to stay on schedule.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'third_down_4v4',
 'Flag 4v4 — Strategy: 3rd down',
 'Convert with concepts that find the sticks: stick at the depth, smash on the corner, mesh vs man. Avoid going way past the line — overthrows and forced passes are drive killers.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'red_zone_4v4',
 'Flag 4v4 — Strategy: Red zone',
 'Field shrinks. Best calls: fade to your tallest WR, slant/flat package, pick concept on the goal line. Stay aggressive — points are points.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'two_minute_4v4',
 'Flag 4v4 — Strategy: Two-minute drill',
 'Sideline routes (out, comeback) to stop the clock. Spike to reset if needed. Convert at all costs — punts (or turnovers on downs) end halves quickly.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_man_4v4',
 'Flag 4v4 — Strategy: Beating man',
 'Mesh, smash, and stack/bunch sets give receivers free release and natural rubs. Get your best WR isolated 1-on-1 vs a slower defender.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'vs_zone_4v4',
 'Flag 4v4 — Strategy: Beating zone',
 'Find the holes between defenders. Curl/flat, levels, and sit routes work. Run flood concepts to overload one zone.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'tempo_4v4',
 'Flag 4v4 — Strategy: Pace',
 'No-huddle disrupts a defense that can''t substitute. After a chunk play, snap fast — defense is still talking. Slow it down to manage clock with the lead.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'matchup_4v4',
 'Flag 4v4 — Strategy: Matchup hunting',
 'With only 3 eligibles, isolating your best vs their worst is huge. Use motion to identify man vs zone, then attack the matchup. Repeat until they adjust.',
 'flag_4v4', null, 'seed', null, true, false),

-- ── Coaching ─────────────────────────────────────────────────────
('global', null, 'tactics', 'practice_4v4',
 'Flag 4v4 — Coaching: Practice structure',
 '45-min template: 5 min warm-up + flag pulling, 10 min position drills (QB / WR / DB), 15 min concept install (1 offense, 1 defense), 10 min 4-on-4 team, 5 min situational. End on a positive rep.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'qb_4v4',
 'Flag 4v4 — Coaching: QB development',
 'Train a 3-second internal clock. Drill quick reads — typically 2-receiver progressions. With smaller fields and tighter coverage, decisive throws beat strong arms.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'wr_4v4',
 'Flag 4v4 — Coaching: WR fundamentals',
 'Sharp cuts on yard markers — depth is everything in tight spaces. Snap eyes back to QB the moment the cut completes. Catch with hands, not body.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'db_4v4',
 'Flag 4v4 — Coaching: DB fundamentals',
 'Backpedal with eyes on the QB (zone) or receiver belt (man). Hip flip on release. Most missed plays come from defenders flat-footed at the snap — drill get-off daily.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'flag_pull_4v4',
 'Flag 4v4 — Coaching: Flag-pull technique',
 'Break down before contact (small choppy steps). Eyes on the flag, not the body. Grab with both hands when possible. Drill 1-on-1 mirror-and-pull weekly.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'install_4v4',
 'Flag 4v4 — Coaching: Install pacing',
 'Younger leagues: 4-6 plays, 1-2 formations. Older / 4v4-elite: 8-12 plays + situational. Add only one new thing per practice. Repetition wins.',
 'flag_4v4', null, 'seed', null, true, false),

('global', null, 'tactics', 'tournament_4v4',
 'Flag 4v4 — Coaching: Tournament management',
 '3-game pool day exhausts kids. Bring water, snacks, sun protection. Rotate liberally in pool play, tighten in bracket. Single-page call sheet, not a binder.',
 'flag_4v4', null, 'seed', null, true, false);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — flag 4v4 strategy + coaching (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'flag_4v4' and d.topic = 'tactics'
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
