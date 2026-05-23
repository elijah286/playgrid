-- Coach AI KB — flag formation library.
--
-- Surfaced 2026-05-23 when a coach asked Cal for a "Diamond" formation in
-- a flag_5v5 playbook and Cal drew Spread Doubles instead — the synthesizer
-- had no Diamond entry, fell back to Spread Doubles, and the KB had no
-- chunk Cal could ground its description in. Companion code change adds
-- Diamond + Tight Diamond + flag stack-I to `src/domain/play/offensiveSynthesize.ts`.
--
-- Prior state (0199_seed_formation_gaps): flag_7v7 had spread + trips only;
-- flag_5v5 had trips only; flag_6v6 had nothing. This migration brings the
-- flag library up to parity with tackle_11 by seeding the common formations
-- across all three flag variants:
--
--   diamond           — 4-point shape (C short, 2 wide, 1 deep middle)
--   tight diamond     — diamond compressed for picks/rubs
--   i_formation       — flag stack-I (receivers in a column behind QB)
--   doubles           — balanced 2x2 spread
--   empty             — all skill on the line, no back
--   bunch             — receivers clustered tight to one side
--   stack             — 2 receivers stacked vertically
--   twins             — 2 receivers one side, isolated on the other
--   singleback        — 1 receiver as a back behind QB
--   trips_bunch       — Trips with the 3 receivers compressed
--
-- All entries are "global" scope so Cal retrieves them for any playbook
-- of the matching sport_variant.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values

-- ── Flag 5v5 — diamond family + I-formation + gap-fill ──────────────

('global', null, 'scheme', 'formation_diamond',
 'NFL Flag 5v5 — Formation: Diamond',
 'Four-point shape that stretches the defense vertically AND horizontally. Placement: C on the ball (short-middle point), X split wide LEFT on the line, Z split wide RIGHT on the line, Y aligned behind the QB at ~7 yds (deep-middle point). QB in shotgun at ~5 yds. The diamond forces a defense to choose: bring extra defenders to wall off the deep middle and you give up the outside; cover the outside and you''re short two underneath. Pairs with crossing concepts (mesh, drive), four-verticals when the deep point releases vertically, and Y-screens off motion. Distinguishes from Spread Doubles by the deep-middle alignment — Doubles puts both inside receivers on the line, Diamond hides Y in the backfield to release late.',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_tight_diamond',
 'NFL Flag 5v5 — Formation: Tight Diamond',
 'Diamond compressed inward — X and Z reduce their splits to ~4 yds from C (instead of the wide ~10 yds), while Y stays aligned at ~7 yds deep middle. The tight splits make pick / rub plays automatic against man press: X and C can cross paths inside 5 yds for a natural rub, and Y can release between the inside defenders. Use vs. teams that play hard man press and don''t switch — the tight bunching causes traffic and forces switches the defense isn''t prepared to make. Pairs with mesh, snag-corner, and stack-release routes. Less effective vs. zone (defenders just play their drops; no traffic to exploit).',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_i_formation',
 'NFL Flag 5v5 — Formation: I-Formation',
 'Flag-context I — QB in shotgun, ONE receiver aligned in the I-stack column directly behind QB at ~7 yds, with the remaining two receivers split wide. Distinct from the tackle Pro-I (which uses a FB + HB under center). The stack receiver can release on a swing, screen, or vertical seam; the wide receivers stretch the defense to keep the box clear. Use for misdirection — motion the stack receiver, run a wide-side handoff, or send the stack on a wheel route after a hard play-fake. Limited in pure passing situations because the stacked alignment telegraphs intent; best when paired with motion or play-action.',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_doubles',
 'NFL Flag 5v5 — Formation: Doubles (2x2)',
 'Balanced spread — C on the ball, QB in shotgun at ~5 yds, X wide on the left and Y as a slot 4-5 yds inside X, Z wide on the right with no slot (or a slot if Y goes to a different alignment). Foundation 5v5 set because it forces the defense to declare strength and prevents over-rotation. Pairs with mesh, smash, four-verts (in 5v5, run as 2-verticals + 2-crossers), and bubble-screen RPOs. The 5v5 version typically runs WITHOUT a back since 5v5 only has 3 skill players — the "single back" becomes a slot receiver instead.',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_empty',
 'NFL Flag 5v5 — Formation: Empty',
 'All 3 skill receivers on the line of scrimmage, no one in the backfield other than the QB. Maximum horizontal stretch — defense MUST commit a defender to every receiver, leaving the middle vacated. Pairs with quick game (slants, hitches), mesh, and any concept that wants 1-on-1 outside. The risk: zero protection from a back means a 4-man rush gets home fast — use only with quick-throw concepts or against a defense that''s rushing 3.',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_bunch',
 'NFL Flag 5v5 — Formation: Bunch',
 'Three receivers clustered tight to one side (within ~3 yds of each other), nothing backside. The bunch creates automatic rubs / picks vs man coverage and floods one half of the field vs zone. Common pairings: snag-corner-flat (3-level stretch), pop-screen to the bunch with two lead blockers, hitches into the open spaces. Defenses respond with bracket coverage (assigning 2 defenders to the bunch) — when you see that, work the backside or attack the deep middle. Variation: tight bunch (receivers within 1-2 yds) maximizes the rub effect; loose bunch (~5 yds spacing) preserves vertical release lanes.',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_stack',
 'NFL Flag 5v5 — Formation: Stack',
 'Two receivers aligned vertically (one directly behind the other) at one outside spot, with the third receiver wide on the opposite side. The stack disguises route distribution because defenders can''t identify which receiver is going where pre-snap. Common designs: front receiver runs a quick out / hitch (occupies the corner) while the back receiver runs a vertical / dig / wheel (gets free release). Pairs with quick-game pick concepts and shotgun screens. Best vs man — vs zone, the stack just gives the corner an easy read.',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_singleback',
 'NFL Flag 5v5 — Formation: Singleback',
 'QB in shotgun with one receiver aligned behind QB as a "back" at ~5 yds — basically a 1-back set. The other 2 receivers split wide. Use to threaten swing screens, draws (in leagues that allow QB runs), and play-action off the back''s motion. In flag the singleback rarely "blocks" (no contact rules vary by league), so the value is misdirection: motion the back wide to create a 3-receiver overload, or run the back on a wheel route after a fake handoff.',
 'flag_5v5', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips_bunch',
 'NFL Flag 5v5 — Formation: Trips Bunch',
 'Trips formation (3 to one side) with the 3 receivers compressed tight together (~2-3 yds apart). Combines the overload of Trips with the rub effect of Bunch — defense has to cover 3 receivers in a tight cluster, which is structurally hard against man. Pairs with snag (3-level stretch), mesh (crossing routes from the bunch), and the H-pop screen. In 5v5 this is the most aggressive man-beater — best used vs. defenses that don''t check to zone or bracket.',
 'flag_5v5', null, 'seed', null, true, false),

-- ── Flag 6v6 — full library (variant had no formation seeds prior) ──

('global', null, 'scheme', 'formation_diamond',
 'Flag 6v6 — Formation: Diamond',
 'Four-point shape adapted for the 6v6 roster (QB + C + 4 skill). C on the ball at the short-middle point, two receivers wide on the LOS at the side points (X left, Z right), one receiver aligned behind QB at ~7 yds as the deep point, and one extra slot off-LOS between C and the strong-side wide WR. The extra slot lets the diamond keep its 4-point character while filling the larger roster. Pairs with the same concepts as the 5v5 diamond (mesh, drive, Y-screens) plus 6v6-only options like quad-strong formations off motion. Stretches the defense more aggressively than 5v5 because there''s an extra receiver to threaten any zone.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_tight_diamond',
 'Flag 6v6 — Formation: Tight Diamond',
 '6v6 diamond compressed: X and Z reduce their splits to ~4 yds from C, the extra slot tucks between C and the strong-side wide WR at ~3 yds, Y stays at ~7 yds deep middle behind QB. The tight bunching forces traffic against man press while preserving the 4-point structural advantage. Use as a primary man-beater set in 6v6. Pairs with mesh, stack release, snag-corner, and any concept that benefits from natural rubs.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_i_formation',
 'Flag 6v6 — Formation: I-Formation',
 'Flag-context I — QB in shotgun, TWO receivers stacked in a column directly behind QB at ~7 and ~10 yds, the remaining two receivers split wide (X left, Z right). The 2-deep stack creates real misdirection options: motion the front stack receiver into a swing/screen while the back stack receiver releases vertically; or run quick play-action off the stack motion. Avoid against teams that play zone — the stacked receivers can''t outflank a deep-half defender. Best vs man press with a switch rule the defense can''t handle.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_doubles',
 'Flag 6v6 — Formation: Doubles (2x2)',
 'Balanced spread for 6v6: C on the ball, QB shotgun, 2 receivers each side (one outside on the LOS, one inside slot off the LOS). Foundation 6v6 set — defense can''t cheat strength, every receiver has a release lane, and the QB has clean reads. Pairs with mesh, smash, snag, four-verts (true 4-verticals with the inside slots), and RPO bubbles. Most 6v6 install playbooks build their first 6-8 plays out of Doubles.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips',
 'Flag 6v6 — Formation: Trips',
 'Three receivers stacked one side, 1 isolated backside. QB in shotgun, C on the ball. The trips side stretches the defense horizontally (3 receivers across), forcing the defense to either rotate coverage to the trips (giving up the backside iso) or stay balanced (giving up a 3-on-2 numbers advantage). Pairs with snag, flood, smash, and quick screens. Common 6v6 base concept vs zone defenses that can''t rotate fast enough.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_empty',
 'Flag 6v6 — Formation: Empty',
 'All 4 skill receivers on or near the LOS (typically 2 outside, 2 slots), no one in the backfield except QB. Forces the defense to commit a defender to every receiver, leaving the middle vacated. Pairs with quick game and mesh. Risk: no back means no swing/screen valve, so any blitz must be answered by the QB''s hot read.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_bunch',
 'Flag 6v6 — Formation: Bunch',
 'Three receivers clustered tight to one side (within ~3 yds), one isolated WR backside, QB in shotgun. Creates rubs vs man and floods a quarter of the field vs zone. The 4th eligible (the strong-side outside WR or a backside isolate) gives the QB a release valve when the bunch is covered. Pairs with snag, mesh, smash, and bubble-screen designs. The backside isolate is a primary tell — if the defense leaves him alone, throw the iso route.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_stack',
 'Flag 6v6 — Formation: Stack',
 'Two receivers aligned vertically at one outside spot (front + back), the other two receivers split as outside + slot on the opposite side. The stack disguises route distribution — defenders can''t identify pre-snap which stack receiver is going where, so the routes diverge cleanly post-snap. Pairs with stack release concepts (front receiver runs a hitch, back receiver runs a vertical) and pick variations. Best vs man press.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_twins',
 'Flag 6v6 — Formation: Twins',
 '6v6 twins — 2 receivers on one side (outside + slot) + 1 receiver isolated on the other side + 1 receiver in the backfield as a back. QB in shotgun. The twins side runs combination routes (pivot-flat, slant-flat, drive concepts) while the isolated WR runs an iso or backside dig. The back swings to keep the strong side honest. Use as a precision-passing base — less explosive than Trips, more precise reads.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_singleback',
 'Flag 6v6 — Formation: Singleback',
 'QB in shotgun with one receiver aligned behind QB as a back (~5 yds deep), the other 3 receivers spread out. The back swings, screens, or releases on a wheel — a structural answer to teams that blitz the QB hard. Pairs with quick game from the spread WRs + a swing/screen valve from the back. The back''s motion can also trigger a 4-receiver overload pre-snap.',
 'flag_6v6', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips_bunch',
 'Flag 6v6 — Formation: Trips Bunch',
 'Trips with the 3 receivers compressed tight (~2-3 yds apart), 1 isolated WR backside. The bunch creates rubs vs man and flood concepts vs zone — the backside iso is a relief valve when the defense brackets the bunch. Primary man-beater set in 6v6. Pairs with snag, mesh, and the H-pop screen.',
 'flag_6v6', null, 'seed', null, true, false),

-- ── Flag 7v7 — diamond family + I-formation + gap-fill ──────────────

('global', null, 'scheme', 'formation_diamond',
 'Flag 7v7 — Formation: Diamond',
 'Four-point shape scaled for the 7v7 roster (QB + C + 5 skill). C at the short point, X and Z wide on the LOS as the side points, one receiver aligned behind QB at ~7 yds as the deep point, and two slot receivers off-LOS between C and the wide WRs. The two extra slots give the diamond more route concepts than its 5v5 / 6v6 cousins — true 4-receiver stretches, mesh + slot-corner combinations, and bracket-busting designs. Pairs with Y-Cross, mesh, drive, and stack-release concepts. Distinguished from Spread Doubles by the deep-middle alignment.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_tight_diamond',
 'Flag 7v7 — Formation: Tight Diamond',
 '7v7 diamond compressed: X and Z reduce their splits to ~5 yds from C, the two slots tuck between C and the wide WRs (~3 yds inside), Y aligned at ~7 yds deep middle. The tight bunching maximizes pick / rub action against man press while preserving the 4-point structural stretch. Best against zone-averse defenses that play man without a switch rule.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_i_formation',
 'Flag 7v7 — Formation: I-Formation',
 'Flag-context I — QB in shotgun, 2 receivers stacked in a column directly behind QB at ~7 and ~10 yds, the remaining 3 receivers split (X left wide, Z right wide, 1 slot). The 2-deep stack creates misdirection: motion the front stack into a swing/screen while the back stack releases vertically; or use the stack as a play-action sell with the wide receivers running quick game. Less common as a base set; most teams use it situationally for specific designs.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_doubles',
 'Flag 7v7 — Formation: Doubles (2x2)',
 '7v7 balanced spread: C on the ball, QB shotgun, 2 receivers each side (X + slot left, Z + slot right). Foundation 7v7 set — defense must declare coverage strength and every receiver has a release lane. Pairs with mesh, smash, four-verts (true 4-verticals with the inside slots), Y-Cross, drive, and any RPO concept. Most 7v7 install playbooks live in some form of Doubles.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_empty',
 'Flag 7v7 — Formation: Empty',
 'All 5 skill receivers on or near the LOS, no back. Maximum horizontal stretch. Pairs with quick game, mesh, and any concept that wants 5-on-5 outside. Risk: no back means no swing/screen valve, so any blitz must be answered by the QB''s hot read.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_bunch',
 'Flag 7v7 — Formation: Bunch',
 '7v7 bunch — 3 receivers clustered tight to one side, 1 isolated WR backside, 1 receiver in the backfield as a back. QB in shotgun. The bunch creates rubs vs man and floods a quarter of the field vs zone. The back provides a swing/screen valve. Pairs with snag (3-level stretch), mesh, smash, and the H-pop screen.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_stack',
 'Flag 7v7 — Formation: Stack',
 'Two receivers aligned vertically (front + back) at one outside spot, the other 3 receivers split as outside + slot on the opposite side + 1 in the backfield. The stack disguises route distribution and creates picks/rubs at the LOS. Best vs man press.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_twins',
 'Flag 7v7 — Formation: Twins',
 '7v7 twins — 2 receivers on one side (outside + slot), 1 receiver isolated on the other side as a flanker, 2 receivers in slot positions, 1 in the backfield as a back. QB in shotgun. The twins side runs combination routes; the isolated WR runs iso or backside dig. Use as a precision-passing base.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_singleback',
 'Flag 7v7 — Formation: Singleback',
 'QB in shotgun with one receiver aligned behind QB as a back (~5 yds deep), the other 4 receivers spread out (X + slot left, Z + slot right). The back swings, screens, or runs wheels — a structural answer to teams that blitz hard. Common as a 1-back base for 7v7 install playbooks.',
 'flag_7v7', null, 'seed', null, true, false),

('global', null, 'scheme', 'formation_trips_bunch',
 'Flag 7v7 — Formation: Trips Bunch',
 'Trips with the 3 receivers compressed tight (~2-3 yds apart), 1 isolated WR backside, 1 receiver in the backfield as a back. Primary man-beater set — the tight bunch forces switches the defense isn''t prepared to make. Pairs with snag, mesh, and the H-pop screen.',
 'flag_7v7', null, 'seed', null, true, false);

-- Mirror to revisions for change history (one row per inserted document).
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create',
       'Initial seed — flag formation library (diamond, tight diamond, I-formation, doubles, empty, bunch, stack, twins, singleback, trips_bunch across flag_5v5/6v6/7v7)',
       null
from public.rag_documents d
where d.sport_variant in ('flag_5v5', 'flag_6v6', 'flag_7v7')
  and d.subtopic in (
    'formation_diamond', 'formation_tight_diamond', 'formation_i_formation',
    'formation_doubles', 'formation_empty', 'formation_bunch',
    'formation_stack', 'formation_twins', 'formation_singleback',
    'formation_trips_bunch', 'formation_trips'
  )
  and d.source = 'seed' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
