-- Coach AI KB — Tackle 11-man coaching techniques (shared, sanctioning_body=NULL).
-- Universal across Pop Warner, AYF, NFHS.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

('global', null, 'tactics', 'practice_structure_tackle',
 'Tackle 11 — Coaching: Practice structure',
 '2-hour template: 15 min dynamic warmup + form tackling, 20 min individual position drills, 20 min group install (offense/defense by unit), 30 min team install/install reps, 25 min team period (11-on-11), 10 min special teams. End on a positive rep.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'first_week_priorities',
 'Tackle 11 — Coaching: First week priorities',
 'Heat acclimatization, conditioning, fundamentals (stance, get-off, hand placement, tackling form). No live tackling first 3 days at youth levels per most state/league rules. Identify position fits — never force a kid into a position based on size alone, watch movement.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'install_pacing_tackle',
 'Tackle 11 — Coaching: Install pacing',
 'Youth (5-10): 4-6 base plays, 1-2 formations. Middle school: 8-12 plays, 2-3 formations. HS varsity: 30-50 plays, 4-6 formations + situational packages. Add only 1-2 new things per week — repetition wins.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'tackling_technique',
 'Tackle 11 — Coaching: Modern tackling (Hawk / rugby-style)',
 'Heads-up tackling with eyes UP, never lead with the crown. Shoulder is the contact point; wrap with both arms; drive feet on contact. Practice with form-tackling tubes, not live, to limit head exposure. USA Football "Heads Up" certifications are league-mandatory at most youth levels.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'ol_stance',
 'Tackle 11 — Coaching: OL stance and first step',
 'Three-point stance (interior) or two-point (in shotgun pass sets). Feet shoulder-width, weight on balls of feet, back flat. First step is short and powerful — 4-6 inches in the direction of the assignment. Drill the first step daily; everything else follows.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'dl_get_off',
 'Tackle 11 — Coaching: DL get-off and hand fighting',
 'Get-off wins reps. Drill ball-keys (eyes on the ball, explode on first movement). Hand fighting: rip, swim, club-and-rip. The lineman who controls the offensive lineman''s hands wins. Daily 1-on-1 pass rush reps with progression: stance → get-off → hand combat.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'qb_drops',
 'Tackle 11 — Coaching: QB drops and footwork',
 '3-step drop = quick game (slants, hitches). 5-step = intermediate (curls, digs). 7-step = deep (verts, posts) with max protection. Shotgun reduces 1 step from each. Footwork must match concept timing — drill with a coach calling depth and timing.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'wr_release_tackle',
 'Tackle 11 — Coaching: WR releases vs press',
 'Vs press: jab step (fake one way, release the other), swim, or speed release. Stack/bunch alignments give a free release — use them for your top WR vs a tight corner. Never let the corner dictate the route timing.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'lb_keys',
 'Tackle 11 — Coaching: Linebacker keys and reads',
 'Keys depend on alignment. Mike: read the FB or guard. Sam/Will: read TE or near guard. Triangle read (back-to-line) tells you flow. 3 yards downhill before flow read = best initial movement. Drill keys daily with a chalkboard, then in walkthroughs.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'db_technique',
 'Tackle 11 — Coaching: DB backpedal and break',
 'Backpedal with eyes through the WR to the QB. Hip flip to transition out of pedal — no crossover. On the break, drive low and forward. Drill: cone backpedal-to-break-on-ball drills daily; live 1-on-1 with QB throwing.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'special_teams',
 'Tackle 11 — Coaching: Special teams emphasis',
 'STs flip field position more than any single offensive play. Dedicate 10-15 min per practice to PAT/FG, punt, kickoff, kickoff return. At youth levels — many leagues eliminate kickoffs, so focus on punt cover/return. Always have a coordinator (often the head coach).',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'gameday_callsheet',
 'Tackle 11 — Coaching: Gameday call sheet',
 'Single sheet by situation: openers (script of 15), 3rd-and-short, 3rd-and-medium, 3rd-and-long, red zone, goal line, 2-point, 2-minute, backed-up, kill-clock. Laminate. Don''t carry a binder — coaches fumbling pages lose moments.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'film_study',
 'Tackle 11 — Coaching: Film study with players',
 'Watch with players, not at them. Show 1-2 good reps + 1 mistake per player per week. Ask "what did you see?" before telling. Self-recognition beats coaching points. 20-minute sessions max — attention drops fast.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'communication_tackle',
 'Tackle 11 — Coaching: Pre-snap communication',
 'OL: front identification ("50!"), Mike point, slide direction. Skill: motion calls, formation tags, hot routes. Defense: front call, coverage call, blitz check, pass strength. Drill communication every snap in practice — silence in the headset is a missed assignment waiting to happen.',
 'tackle_11', null, 'seed', null, true, false),

('global', null, 'tactics', 'parent_management',
 'Tackle 11 — Coaching: Parent communication',
 'Set expectations at a preseason meeting: playing time, position decisions, communication channel. 24-hour rule — no game-night calls. Coach the player, not the parent. At youth levels, MPR enforces minimums; communicate above-MPR decisions clearly.',
 'tackle_11', null, 'seed', null, true, false);

-- Initial revisions.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create', 'Initial seed — tackle 11 shared coaching (drafted, beta authoritative)', null
from public.rag_documents d
where d.sport_variant = 'tackle_11'
  and d.sanctioning_body is null
  and d.topic = 'tactics'
  and d.subtopic in (
    'practice_structure_tackle','first_week_priorities','install_pacing_tackle',
    'tackling_technique','ol_stance','dl_get_off','qb_drops','wr_release_tackle',
    'lb_keys','db_technique','special_teams','gameday_callsheet','film_study',
    'communication_tackle','parent_management')
  and d.source = 'seed'
  and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
