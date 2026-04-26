-- Seed Coach AI knowledge base with 4v4 / "screen" flag football rules.
--
-- 4v4 flag (sometimes called Screen Flag) is common in youth rec leagues
-- (5U-8U) as an entry-level format. Rules vary widely by league but the
-- core pattern (no rush, screen plays, simplified positions) is consistent.
--
-- Note: introduces sport_variant='flag_4v4' which is not yet a selectable
-- variant in the playbook UI.
--
-- All rows authoritative=false / needs_review=true.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, game_level,
  source, source_note,
  authoritative, needs_review
) values

('global', null,
 'rules', 'overview',
 '4v4 Flag — Overview',
 '4v4 flag football is the most common entry-level youth format, played by leagues like NFL FLAG i9, Upward, and many YMCA/parks-and-rec leagues for ages 5-8. Four players per side. Simplified rules emphasize touches and learning; minimal contact, often no pass rush at all, and structured plays designed by the coach.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'field',
 '4v4 Flag — Field dimensions',
 'Field is typically 30 yards long with two 5- to 10-yard end zones, 15-25 yards wide. Smallest version: a 25x40 yard field. The line to gain is typically at midfield (one first down per drive).',
 'flag_4v4', null, 'youth', 'seed',
 'Field size varies by league.',
 false, true),

('global', null,
 'rules', 'players',
 '4v4 Flag — Players on field',
 'Four players per side. Common positions: QB, center, and two skill players (or QB plus three eligible receivers — no center, with a direct snap from the ground). All offensive players are eligible receivers.',
 'flag_4v4', null, 'youth', 'seed',
 'Center vs no-center varies by league.',
 false, true),

('global', null,
 'rules', 'no_rush',
 '4v4 Flag — Pass rush',
 'Most 4v4 youth leagues prohibit pass rushing entirely (the QB has unlimited time to throw). Some leagues allow a single rusher from a fixed distance (often 5 or 7 yards) after the official says "go." This is the single most variable rule between 4v4 leagues.',
 'flag_4v4', null, 'youth', 'seed',
 'Verify per league.',
 false, true),

('global', null,
 'rules', 'pass_clock',
 '4v4 Flag — Pass clock',
 'When there is no rush, leagues commonly impose a pass clock (5-7 seconds) to keep play moving. Some use no clock at all, relying on the coach to keep tempo.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'no_run_zones',
 '4v4 Flag — No-run zones',
 'Most leagues have no-run zones near the end zone (typically the last 5 yards) to encourage passing in scoring position. Designed runs are illegal in the no-run zone — the ball must be passed.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'snap',
 '4v4 Flag — Snap',
 'In leagues with a center, the snap is between the legs to a QB standing 1-3 yards back. In leagues without a center, the QB picks the ball up off the ground at "set, hut" and play begins. The center (if used) may be eligible to receive a pass.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'downs',
 '4v4 Flag — Downs and line to gain',
 'Common: 3 or 4 downs to cross midfield (line to gain), then 3 or 4 more downs to score. Failure = turnover at the spot. No punts.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'scoring',
 '4v4 Flag — Scoring',
 'Touchdown = 6 points. Extra point from a short distance (often 5 yards) = 1 point. Some leagues offer a 2-point try from further (10 yards). Defensive interception returned for a TD = 6. Safeties are uncommon in 4v4 because there is no run game and short fields.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'flag_pull',
 '4v4 Flag — Flag pulls and contact',
 'Ball carrier is down when their flag is pulled, when they step out of bounds, or when the ball touches the ground. No physical contact allowed beyond the flag pull. Defenders may not push, hold, or strip the ball. Ball carriers may not stiff-arm, dive, jump, or spin.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'blocking',
 '4v4 Flag — Blocking',
 'No blocking allowed. Offensive players must avoid physical contact with defenders. Screen routes (running close to a defender to obstruct) are typically allowed but pick plays designed to make contact are penalized.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'coach_on_field',
 '4v4 Flag — Coach on field',
 'In the youngest divisions (5U-6U), one coach per team is often allowed on the field during plays to help the players line up and call the play. The coach must be off the field at the snap and may not coach during the live ball. This is league-specific.',
 'flag_4v4', null, 'youth', 'seed',
 'Coach-on-field rules vary by league/division.',
 false, true),

('global', null,
 'rules', 'penalties',
 '4v4 Flag — Common penalties',
 'Common penalties (yardage varies because the field is short — often 3 or 5 yards): false start, illegal motion, illegal forward pass, offensive pass interference, flag guarding, illegal contact (defense), defensive holding, defensive pass interference (often a spot foul + automatic first down). At younger divisions officials often warn before flagging.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'overtime',
 '4v4 Flag — Overtime',
 'Most rec leagues let regular-season ties stand. Tournament/playoff overtime is typically a single-possession shootout from a short distance (often 5 yards) with each team getting one play to score.',
 'flag_4v4', null, 'youth', 'seed', null, false, true),

('global', null,
 'rules', 'prohibited',
 '4v4 Flag — Prohibited actions',
 'Prohibited at all times: any blocking, contact-based defense, stiff-arming, diving, jumping, spinning, flag guarding, designed runs in the no-run zone, and (in most leagues) any pass rush. Safety is the priority — younger divisions enforce these strictly with warnings before penalties.',
 'flag_4v4', null, 'youth', 'seed', null, false, true);

insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select
  d.id, 1,
  d.title, d.content, d.source, d.source_note,
  d.authoritative, d.needs_review,
  'create', 'Initial seed (drafted, awaiting admin verification)', null
from public.rag_documents d
where d.sport_variant = 'flag_4v4'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
