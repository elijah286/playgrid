-- Coach AI KB — Flag 7v7 coaching techniques.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'tactics', 'practice_structure',
 'Flag 7v7 — Coaching: Practice structure',
 '60-minute template: 10 min dynamic warm-up + flag pulling, 10 min individual position skills (QB drops + throws / WR routes / DB drops), 15 min concept install (one offensive + one defensive call), 15 min 7-on-7 team period, 10 min situational. End on a positive rep.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'qb_count_training',
 'Flag 7v7 — Coaching: Training the QB to the count',
 'Drill the count cadence in every QB throw. Have a coach (or sideline timer) count out loud or silently. The QB should know what time of his progression he''s on at 1, 2, 3 seconds — by 3.5 seconds the ball must be in the air.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'qb_progression',
 'Flag 7v7 — Coaching: Teaching QB progressions',
 'Every concept has a defined read: e.g. Snag = corner first (high read), then snag (mid), then flat (low). Teach the QB to make the read in 1-2 seconds and pull the trigger. Decision-making is more important than arm strength in 7v7.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'wr_route_running',
 'Flag 7v7 — Coaching: Receiver route precision',
 'Routes win on depth (count steps), sharp cuts (plant outside foot, drive off it), and snap-back-to-QB (eyes find QB the moment the cut is complete). Run route trees on a yard-marked field — receivers call out depth at every cut.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'wr_release',
 'Flag 7v7 — Coaching: Receiver releases vs press',
 'Vs press the receiver wants a clean release into the route. Teach a 1-step jab (fake outside, release inside) and a quick speed release. Stacks/bunch eliminate the press problem entirely — use them when an outside receiver is getting jammed.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'db_pedal',
 'Flag 7v7 — Coaching: Defensive back footwork',
 'Defensive backs play backpedal at the snap, eyes through the receiver to the QB. On a release move, transition with a hip flip (open the inside hip). Don''t cross over — it adds a step. Drill: cone backpedal-to-break drills daily.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'db_eyes',
 'Flag 7v7 — Coaching: Where defensive backs look',
 'Man defenders: eyes on the receiver''s belt (the belt tells you where they''re going). Zone defenders: eyes on the QB. Common mistake: zone defenders watching their nearest receiver and getting beaten by a route running into their zone from elsewhere.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'flag_pull_drill',
 'Flag 7v7 — Coaching: Flag-pull fundamentals',
 'Most missed flag pulls come from defenders lunging at the body. Teach: break down (small choppy steps) before contact, eyes on the flag, grab with both hands if needed. Drill: 1-on-1 corner runs where the defender must mirror and pull without grabbing.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'install_pacing',
 'Flag 7v7 — Coaching: Install pacing',
 'Younger HS / middle school: 6-8 base concepts mastered beats 15 half-known. Older HS / 7v7-elite: 10-15 concepts plus situational packages. Add only one new concept per practice — repetition wins.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'situational_drill',
 'Flag 7v7 — Coaching: Situational scrimmage',
 'End every practice with 5 minutes of game-situation reps: "3rd-and-7 from your own 30, 90 seconds left, down 5." Cycle through 4-5 situations per week. Players get used to urgency before game day.',
 'flag_7v7', null, 'seed', null, false, true),

('global', null, 'tactics', 'tournament_prep',
 'Flag 7v7 — Coaching: Tournament-day prep',
 '3-game pool day is exhausting. Bring water, snacks, sunscreen, extra flags, an extra ball. Rotate liberally in pool play. In bracket play tighten the rotation to your best 8-10. Have a single-page call sheet — coaches fumbling through play binders lose moments.',
 'flag_7v7', null, 'seed', null, false, true);

insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — 7v7 coaching (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_7v7' and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
