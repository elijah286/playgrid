/**
 * Defensive reactor catalog — Layer 1 (per AGENTS.md).
 *
 * When a defense is overlaid onto a known offensive concept, certain
 * defenders react to specific receivers in characteristic ways (HL jumps
 * the slant, M carries the seam, FS robs the dig). This catalog encodes
 * those (coverage × concept) reactions so compose_defense can populate
 * defender movement automatically — without this catalog, defenders sit
 * static in their zones and the coach has no teaching value beyond the
 * alignment.
 *
 * Per the user's design decision (2026-05-20), only KEY REACTORS get
 * explicit paths — defenders whose movement is the teaching point.
 * Other defenders stay in their catalog zone. This keeps the diagram
 * readable; over-drawing every defender's micro-movement clutters the
 * field and loses the point.
 *
 * Pattern lookup is keyed by (variant, coverage, concept). Concept names
 * align with CONCEPT_CATALOG entries — "Flood", "Mesh", "Slant-Flat",
 * "Smash", "Four Verticals", "Curl-Flat".
 *
 * Coordinate system matches CoachDiagram: x = yards from center (negative
 * left, positive right), y = yards downfield. Reactor paths are computed
 * at render time by `reactivePathFor` in specRenderer.ts — this catalog
 * stores INTENT (which defender reacts to whom with what behavior),
 * not geometry.
 *
 * Adding a new pattern:
 *   1. Pick the (variant, coverage, concept) triple.
 *   2. List ONLY the defenders whose reaction is the teaching point.
 *   3. For each, name the trigger (offensive player id) and behavior.
 *   4. Add a short cue Cal can include in the prose (one line per reactor).
 *
 * Adding a new behavior: extend the `ReactorBehavior` union AND the
 * matching branch in `reactivePathFor` (specRenderer.ts:509). The
 * TypeScript exhaustive switch catches mismatches at compile time.
 */

import type { SportVariant } from "./types";

export type ReactorBehavior =
  | "jump_route"
  | "carry_vertical"
  | "follow_to_flat"
  | "wall_off"
  | "robber";

export type ReactorAssignment = {
  /** Catalog defender id (e.g. "HL", "M", "CB"). Must match a defender
   *  in the matching alignment's players[]. */
  defender: string;
  /** Offensive player id that triggers the reaction (e.g. "X", "H", "Z"). */
  trigger: string;
  behavior: ReactorBehavior;
  /** One-line coaching cue surfaced in defense prose. Should describe
   *  the read and the action a coach would say to that defender. */
  cue: string;
};

export type ReactorPattern = {
  variant: SportVariant;
  /** Coverage name as it appears in the alignment catalog ("Tampa 2",
   *  "Cover 3", "Cover 1", "Cover 0"). Match is exact, case-insensitive. */
  coverage: string;
  /** Concept name as it appears in CONCEPT_CATALOG ("Flood", "Mesh", etc.). */
  concept: string;
  /** Plain-English summary Cal can echo back. */
  description: string;
  reactors: ReactorAssignment[];
};

// ── 7v7 patterns ──────────────────────────────────────────────────────────

const F7_TAMPA2_VS_SLANTFLAT: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Tampa 2",
  concept: "Slant-Flat",
  description:
    "Tampa 2 reads Slant-Flat as a sweet-spot concept. HL is the key — he sits in his hook and drives DOWNHILL on @X's slant at the break. CB stays low to cap the flat by @H. M reads vertical from @Y/@Z; if both stay short, M robs the middle.",
  reactors: [
    { defender: "HL", trigger: "X", behavior: "jump_route",
      cue: "Reads @X's slant — sits 5 yds, drives downhill at the break." },
    { defender: "CB", trigger: "H", behavior: "follow_to_flat",
      cue: "Squeezes the flat — caps @H short of the sideline." },
    { defender: "M", trigger: "Y", behavior: "robber",
      cue: "Robs the middle behind HL; carries any seam late." },
  ],
};

const F7_TAMPA2_VS_FLOOD: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Tampa 2",
  concept: "Flood",
  description:
    "Tampa 2 vs Flood — three-level stretch to one side. CB takes the flat (lowest), HR carries the intermediate, FS rotates to cap the deep. M robs the middle in case of the backside dig.",
  reactors: [
    { defender: "CB", trigger: "H", behavior: "follow_to_flat",
      cue: "Jumps the flat by @H — first read." },
    { defender: "HR", trigger: "Y", behavior: "jump_route",
      cue: "Sinks under the intermediate — drives on @Y's break." },
    { defender: "FS", trigger: "Z", behavior: "carry_vertical",
      cue: "Caps the deep — carries @Z vertical, no shot over the top." },
  ],
};

const F7_TAMPA2_VS_MESH: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Tampa 2",
  concept: "Mesh",
  description:
    "Tampa 2 vs Mesh — two crossing drags at 2-6 yds. HL and HR wall off the crossers from inside out so they don't run free across the middle. M sits in the dead spot 8-10 yds.",
  reactors: [
    { defender: "HL", trigger: "H", behavior: "wall_off",
      cue: "Walls off the underneath drag — re-routes @H inside out." },
    { defender: "HR", trigger: "Y", behavior: "wall_off",
      cue: "Walls off the second drag — keeps @Y from running clean." },
    { defender: "M", trigger: "X", behavior: "robber",
      cue: "Sits 8-10 yds robbing the dig behind the mesh." },
  ],
};

const F7_TAMPA2_VS_VERTICALS: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Tampa 2",
  concept: "Four Verticals",
  description:
    "Tampa 2 vs Four Verts — the M pulls the seam carry job. FS / SS stay over the top on the outside verticals. HL and HR pass off the inside seams to M then sink to wall any underneath check.",
  reactors: [
    { defender: "M", trigger: "Y", behavior: "carry_vertical",
      cue: "Sprints to the deep middle hole — takes the inside seam (@Y)." },
    { defender: "FS", trigger: "X", behavior: "carry_vertical",
      cue: "Stays over the top of @X — no go-ball over his head." },
    { defender: "SS", trigger: "Z", behavior: "carry_vertical",
      cue: "Stays over the top of @Z — no go-ball over his head." },
  ],
};

const F7_TAMPA2_VS_SMASH: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Tampa 2",
  concept: "Smash",
  description:
    "Tampa 2 vs Smash — corner-hitch combo. The hi-lo on the CB is the problem; in Tampa 2 the FS/SS rotate to take the corner away and the CB stays underneath on the hitch.",
  reactors: [
    { defender: "CB", trigger: "X", behavior: "jump_route",
      cue: "Stays low — drives on the hitch by @X (give up the corner)." },
    { defender: "SS", trigger: "Z", behavior: "carry_vertical",
      cue: "Rotates over the corner route — no easy fade." },
  ],
};

const F7_COVER3_VS_FLOOD: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 3",
  concept: "Flood",
  description:
    "Cover 3 vs Flood — three-receiver stretch. The flat defender (FL/FR) attacks the flat; the curl/hook drops UNDER the intermediate; the deep third defender carries the vertical. Classic answer.",
  reactors: [
    { defender: "FR", trigger: "H", behavior: "follow_to_flat",
      cue: "Hits the flat by @H — first read." },
    { defender: "HR", trigger: "Y", behavior: "jump_route",
      cue: "Sinks under the intermediate — drives on @Y's break." },
    { defender: "CB", trigger: "Z", behavior: "carry_vertical",
      cue: "Strong-side deep third — carries @Z vertical, never lets him behind." },
  ],
};

const F7_COVER3_VS_SMASH: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 3",
  concept: "Smash",
  description:
    "Cover 3 vs Smash — the corner route attacks the flat-to-deep seam. The cloud rotation has the CB jump the corner from underneath; the flat defender takes the hitch.",
  reactors: [
    { defender: "FR", trigger: "X", behavior: "jump_route",
      cue: "Sits on the hitch by @X — first underneath read." },
    { defender: "CB", trigger: "Z", behavior: "carry_vertical",
      cue: "Cloud's the corner — carries @Z's corner route from underneath." },
  ],
};

const F7_COVER3_VS_MESH: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 3",
  concept: "Mesh",
  description:
    "Cover 3 vs Mesh — wall off the crossers from the hook zones. The hook defenders re-route the drags to slow the mesh and make the QB hold the ball.",
  reactors: [
    { defender: "HL", trigger: "H", behavior: "wall_off",
      cue: "Walls off the first crosser (@H) — squeezes inside-out from the left hook." },
    { defender: "HR", trigger: "Y", behavior: "wall_off",
      cue: "Walls off the second crosser (@Y) from the right hook — same re-route technique." },
  ],
};

const F7_COVER3_VS_CURLFLAT: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 3",
  concept: "Curl-Flat",
  description:
    "Cover 3 vs Curl-Flat — the spot drop concept. The flat defender attacks the flat; the curl defender wall-offs the curl; the deep third covers any vertical leak.",
  reactors: [
    { defender: "FR", trigger: "H", behavior: "follow_to_flat",
      cue: "Drives on the flat by @H — first read." },
    { defender: "HR", trigger: "Z", behavior: "jump_route",
      cue: "Sits the curl by @Z — drives on the comeback." },
  ],
};

const F7_COVER3_VS_VERTICALS: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 3",
  concept: "Four Verticals",
  description:
    "Cover 3 vs Four Verts — the seam holes hurt this coverage. Deep thirds carry the outside verts; FS (deep middle) carries one inside seam, hooks rally to the other.",
  reactors: [
    { defender: "FS", trigger: "Y", behavior: "carry_vertical",
      cue: "Carries the strong-side seam (@Y) — overlaps deep middle." },
    { defender: "HR", trigger: "Z", behavior: "carry_vertical",
      cue: "Sinks under @Z's vertical — closes the seam window." },
  ],
};

const F7_COVER1_VS_FLOOD: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 1",
  concept: "Flood",
  description:
    "Cover 1 vs Flood — pure man with FS deep middle help. Each underneath defender locks his man; FS reads the QB and helps over the top of the vertical.",
  reactors: [
    { defender: "FS", trigger: "Z", behavior: "carry_vertical",
      cue: "Free safety help — gets over the top of the deepest vertical (@Z)." },
  ],
};

const F7_COVER1_VS_SLANTFLAT: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 1",
  concept: "Slant-Flat",
  description:
    "Cover 1 vs Slant-Flat — man coverage. The CB on @X jumps the slant aggressively (he has inside help from FS). The flat defender takes @H step for step.",
  reactors: [
    { defender: "CB", trigger: "X", behavior: "jump_route",
      cue: "Inside-leverage — drives on the slant break (FS is over the top)." },
  ],
};

const F7_COVER1_VS_VERTICALS: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 1",
  concept: "Four Verticals",
  description:
    "Cover 1 vs Four Verts — the FS picks a side. Whichever inside vertical threatens deepest, FS overlaps. The other inside vert is a 1-on-1 the LB has to carry.",
  reactors: [
    { defender: "FS", trigger: "Y", behavior: "carry_vertical",
      cue: "Picks the strongest vertical (@Y) — overlap deep." },
  ],
};

const F7_COVER0_VS_ALL: ReactorPattern = {
  variant: "flag_7v7",
  coverage: "Cover 0",
  concept: "*",
  description:
    "Cover 0 (all-out blitz) vs anything — no safety help. Every underneath defender is in man with no deep help; the front rushes 5+. The teaching point is that the QB has to throw HOT on every snap.",
  reactors: [
    // Cover 0's reactors are mostly "match your man" — no read-and-react.
    // The instructive part is the blitz, which is on the blitzing defenders'
    // alignment-level assignments. Reactor catalog stays empty for now;
    // future iteration could add specific blitz paths.
  ],
};

// ── tackle_11 patterns ────────────────────────────────────────────────────
// Tackle_11 has no Tampa 2 / Cover 0 alignment in the catalog (yet); only
// patterns where the matching alignment exists (Cover 3 / Cover 1) are seeded.

const T11_COVER3_VS_FLOOD: ReactorPattern = {
  variant: "tackle_11",
  coverage: "Cover 3",
  concept: "Flood",
  description:
    "Cover 3 vs Flood — textbook answer. SL (strong LB) attacks the flat; SS (the strong-side rotated flat/hook defender) sinks under the intermediate; deep-third CB carries the vertical.",
  reactors: [
    { defender: "SL", trigger: "H", behavior: "follow_to_flat",
      cue: "Sam attacks the flat by @H — first read." },
    { defender: "SS", trigger: "Y", behavior: "jump_route",
      cue: "Sinks under the sail by @Y." },
    { defender: "CB", trigger: "Z", behavior: "carry_vertical",
      cue: "Deep third — carries @Z over the top." },
  ],
};

const T11_COVER3_VS_SMASH: ReactorPattern = {
  variant: "tackle_11",
  coverage: "Cover 3",
  concept: "Smash",
  description:
    "Cover 3 vs Smash — cloud the corner with the CB; the flat defender squeezes the hitch.",
  reactors: [
    { defender: "SL", trigger: "X", behavior: "jump_route",
      cue: "Sits on the hitch by @X — first read." },
    { defender: "CB", trigger: "Z", behavior: "carry_vertical",
      cue: "Cloud's the corner — undercuts @Z from below." },
  ],
};

const T11_COVER1_VS_FLOOD: ReactorPattern = {
  variant: "tackle_11",
  coverage: "Cover 1",
  concept: "Flood",
  description:
    "Cover 1 vs Flood — man with FS help over the top. FS reads QB to the vertical side; everyone else locks man.",
  reactors: [
    { defender: "FS", trigger: "Z", behavior: "carry_vertical",
      cue: "Free safety help — gets over the top of the vertical (@Z)." },
  ],
};

const T11_COVER1_VS_SLANTFLAT: ReactorPattern = {
  variant: "tackle_11",
  coverage: "Cover 1",
  concept: "Slant-Flat",
  description:
    "Cover 1 vs Slant-Flat — CB on @X plays inside leverage (knows he has FS over the top), drives on the slant. The flat is locked man-on-man.",
  reactors: [
    { defender: "CB", trigger: "X", behavior: "jump_route",
      cue: "Inside-leverage drive on the slant break." },
  ],
};

const T11_COVER0_VS_ALL: ReactorPattern = {
  variant: "tackle_11",
  coverage: "Cover 0",
  concept: "*",
  description:
    "Cover 0 (all-out blitz) — every underneath defender locks his man, the front rushes 5+. No deep help. Coach the QB to throw hot every snap.",
  reactors: [],
};

// ── flag_5v5 patterns ─────────────────────────────────────────────────────
// flag_5v5 catalogued alignments are F5_COVER_3 ("5v5 Zone" + "Cover 3",
// defenders FL/FR/CB/FS/CB2 after suffix) and F5_COVER_1 ("5v5 Man" +
// "Cover 1", defenders CB/NB/NB2/CB2/FS after suffix). Reactor triggers
// reference the canonical 5v5 offensive roster {X, Y, Z, C} — not the
// tackle/7v7 H/S labels — since the synthesizer remaps non-canonical
// labels in flag_5v5. Added 2026-05-23 after a coach surfaced static
// defenders ("Cal failed to show how the defense should move as the play
// develops") on a 5v5 install — the reactor catalog had zero flag_5v5
// entries, so the overlay branch's reactor pass found no pattern and
// defenders stayed at their alignment positions.

const F5_COVER3_VS_SMASH: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 3",
  concept: "Smash",
  description:
    "Cover 3 vs Smash in 5v5 — the corner-hitch puts CB2 in a vertical bind. Cloud the corner: CB2 carries @Z from underneath, FR drives down on the hitch by @Y. FS stays middle-third for the deep post relief.",
  reactors: [
    { defender: "FR", trigger: "Y", behavior: "jump_route",
      cue: "Sits on the hitch by @Y — drives down on the break, no separation." },
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Cloud's the corner — undercuts @Z's corner route from below." },
  ],
};

const F5_COVER3_VS_SLANTFLAT: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 3",
  concept: "Slant-Flat",
  description:
    "Cover 3 vs Slant-Flat in 5v5 — the slant attacks the hook seam, flat attacks the soft corner. FL drives downhill on @X's slant break; FR squeezes the flat. CB stays over the top on any deep release.",
  reactors: [
    { defender: "FL", trigger: "X", behavior: "jump_route",
      cue: "Drives downhill on @X's slant at the break — 5-yd window, attack." },
    { defender: "FR", trigger: "Y", behavior: "follow_to_flat",
      cue: "Caps the flat by @Y — no easy outside catch." },
  ],
};

const F5_COVER3_VS_MESH: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 3",
  concept: "Mesh",
  description:
    "Cover 3 vs Mesh in 5v5 — wall off the crossing drags from the flat zones. FL re-routes @X's drag inside-out; FR walls @Y as the second crosser comes through. FS stays clean over the top to take any vertical leak.",
  reactors: [
    { defender: "FL", trigger: "X", behavior: "wall_off",
      cue: "Walls off @X's drag — re-routes inside-out so the QB has to hold." },
    { defender: "FR", trigger: "Y", behavior: "wall_off",
      cue: "Walls off the second crosser (@Y) from the right flat zone." },
  ],
};

const F5_COVER3_VS_FLOOD: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 3",
  concept: "Flood",
  description:
    "Cover 3 vs Flood in 5v5 — three-level stretch to one side. FR jumps the flat; FS rotates to help over the top of the corner; CB2 carries the vertical. The classic Cover-3 spot drop answer.",
  reactors: [
    { defender: "FR", trigger: "C", behavior: "follow_to_flat",
      cue: "Hits the flat by @C — first underneath read." },
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Strong-side deep third — carries @Z, no shot over the top." },
    { defender: "FS", trigger: "Y", behavior: "robber",
      cue: "Reads the intermediate — robs the sail by @Y." },
  ],
};

const F5_COVER3_VS_SNAG: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 3",
  concept: "Snag",
  description:
    "Cover 3 vs Snag in 5v5 — the trips-side stretch puts FR in a hi-lo bind (flat by @C, corner by @Z). FR jumps the flat to take the lowest threat; CB2 carries @Z's corner; FS reads QB eyes and rotates to help.",
  reactors: [
    { defender: "FR", trigger: "C", behavior: "follow_to_flat",
      cue: "Sits the flat by @C — first read; let CB2 take the corner." },
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Carries @Z's corner — no easy fade behind." },
  ],
};

const F5_COVER3_VS_VERTICALS: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 3",
  concept: "Four Verticals",
  description:
    "Cover 3 vs Four Verts in 5v5 — three deep, but four receivers (incl. @C) attack the vertical. CB carries @X; CB2 carries @Z; FS takes the most-threatening inside seam (usually @Y). FL/FR drop to underneath verticals (the @C check release).",
  reactors: [
    { defender: "CB", trigger: "X", behavior: "carry_vertical",
      cue: "Stays over the top of @X — no go-ball over his head." },
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Stays over the top of @Z — no go-ball over his head." },
    { defender: "FS", trigger: "Y", behavior: "carry_vertical",
      cue: "Closes the deep middle — takes the inside seam (@Y)." },
  ],
};

const F5_COVER1_VS_SMASH: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 1",
  concept: "Smash",
  description:
    "Cover 1 vs Smash in 5v5 — man-with-help. CB2 locks @Z in man, expects FS over the top on the corner route. CB stays low on @Y's hitch, drives at the break. FS reads QB eyes and rotates to the corner-side deep half.",
  reactors: [
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Press-trail @Z — drives the corner upfield, FS has the deep half over the top." },
    { defender: "CB", trigger: "Y", behavior: "jump_route",
      cue: "Drives down on @Y's hitch at the break — inside leverage." },
    { defender: "FS", trigger: "Z", behavior: "robber",
      cue: "Reads QB to the corner side — caps any deep shot over the top of @Z." },
  ],
};

const F5_COVER1_VS_SLANTFLAT: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 1",
  concept: "Slant-Flat",
  description:
    "Cover 1 vs Slant-Flat in 5v5 — CB plays inside leverage on @X knowing FS is the deep-middle insurance. He drives on the slant at the break. NB tracks the flat in man.",
  reactors: [
    { defender: "CB", trigger: "X", behavior: "jump_route",
      cue: "Inside-leverage trail on @X — drives downhill on the slant break (FS has deep)." },
  ],
};

const F5_COVER1_VS_MESH: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 1",
  concept: "Mesh",
  description:
    "Cover 1 vs Mesh in 5v5 — the crossers test the man defenders' switch rules. Default: stay with your man across the mesh (trail technique, not switch). NB and NB2 communicate the rub and pass off if needed. CB/CB2 stay tight on @X/@Z.",
  reactors: [
    { defender: "NB", trigger: "X", behavior: "wall_off",
      cue: "Trails @X across the mesh — no clean break from the rub." },
    { defender: "NB2", trigger: "Y", behavior: "wall_off",
      cue: "Trails @Y across the mesh — communicate switch only if compromised." },
  ],
};

const F5_COVER1_VS_FLOOD: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 1",
  concept: "Flood",
  description:
    "Cover 1 vs Flood in 5v5 — three to one side stresses the man defenders. FS rotates to the flood side for vertical help. CB/NB/CB2 stay tight in man; trust the help and don't bail on the deep route.",
  reactors: [
    { defender: "FS", trigger: "Z", behavior: "carry_vertical",
      cue: "Rotates to the flood side — over-the-top help on @Z." },
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Press-trail @Z — FS is over the top, no need to bail." },
  ],
};

const F5_COVER1_VS_SNAG: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 1",
  concept: "Snag",
  description:
    "Cover 1 vs Snag in 5v5 — the trips-side combination uses natural rubs. CB/NB2/CB2 stay tight in man on @X/@Y/@Z, communicate the rub at the LOS, and use trail technique. FS reads QB eyes for late help.",
  reactors: [
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Trails @Z's corner — FS has deep help on the strong side." },
    { defender: "NB2", trigger: "Y", behavior: "jump_route",
      cue: "Trails @Y across the snag — drives down on the square-in break." },
  ],
};

const F5_COVER1_VS_VERTICALS: ReactorPattern = {
  variant: "flag_5v5",
  coverage: "Cover 1",
  concept: "Four Verticals",
  description:
    "Cover 1 vs Four Verts in 5v5 — the offense wants to isolate FS deep. CB/CB2 press-trail the outside verticals; NB/NB2 trail the inside seams. FS reads QB and rotates to the most-threatening seam (usually the strongside Y).",
  reactors: [
    { defender: "CB", trigger: "X", behavior: "carry_vertical",
      cue: "Press-trail @X up the sideline — no separation." },
    { defender: "CB2", trigger: "Z", behavior: "carry_vertical",
      cue: "Press-trail @Z up the sideline — no separation." },
    { defender: "FS", trigger: "Y", behavior: "carry_vertical",
      cue: "Reads QB; rotates to whichever inside seam shows first — takes @Y." },
  ],
};

// ── Catalog ───────────────────────────────────────────────────────────────

export const REACTOR_PATTERNS: ReactorPattern[] = [
  // 7v7
  F7_TAMPA2_VS_SLANTFLAT,
  F7_TAMPA2_VS_FLOOD,
  F7_TAMPA2_VS_MESH,
  F7_TAMPA2_VS_VERTICALS,
  F7_TAMPA2_VS_SMASH,
  F7_COVER3_VS_FLOOD,
  F7_COVER3_VS_SMASH,
  F7_COVER3_VS_MESH,
  F7_COVER3_VS_CURLFLAT,
  F7_COVER3_VS_VERTICALS,
  F7_COVER1_VS_FLOOD,
  F7_COVER1_VS_SLANTFLAT,
  F7_COVER1_VS_VERTICALS,
  F7_COVER0_VS_ALL,
  // tackle_11 (only coverages that have a tackle_11 alignment)
  T11_COVER3_VS_FLOOD,
  T11_COVER3_VS_SMASH,
  T11_COVER1_VS_FLOOD,
  T11_COVER1_VS_SLANTFLAT,
  T11_COVER0_VS_ALL,
  // flag_5v5
  F5_COVER3_VS_SMASH,
  F5_COVER3_VS_SLANTFLAT,
  F5_COVER3_VS_MESH,
  F5_COVER3_VS_FLOOD,
  F5_COVER3_VS_SNAG,
  F5_COVER3_VS_VERTICALS,
  F5_COVER1_VS_SMASH,
  F5_COVER1_VS_SLANTFLAT,
  F5_COVER1_VS_MESH,
  F5_COVER1_VS_FLOOD,
  F5_COVER1_VS_SNAG,
  F5_COVER1_VS_VERTICALS,
];

/**
 * Find a reactor pattern for (variant, coverage, concept). Matches are
 * case-insensitive on coverage and concept. Returns null when no pattern
 * exists — the caller should fall back to static defender placement.
 *
 * Cover 0 entries use concept="*" as a wildcard since the reactor set
 * is uniform across concepts (all-out blitz, no deep help).
 */
export function findReactorPattern(
  variant: SportVariant,
  coverage: string,
  concept: string,
): ReactorPattern | null {
  const cov = coverage.trim().toLowerCase();
  const con = concept.trim().toLowerCase();
  if (!cov || !con) return null;
  // Exact concept match first.
  for (const p of REACTOR_PATTERNS) {
    if (p.variant !== variant) continue;
    if (p.coverage.toLowerCase() !== cov) continue;
    if (p.concept.toLowerCase() === con) return p;
  }
  // Wildcard fallback (Cover 0 mainly).
  for (const p of REACTOR_PATTERNS) {
    if (p.variant !== variant) continue;
    if (p.coverage.toLowerCase() !== cov) continue;
    if (p.concept === "*") return p;
  }
  return null;
}

/**
 * Best-effort concept detection from a freehand CoachDiagram fence's
 * `title` string. Returns the canonical concept name when it appears in
 * the title (case-insensitive substring match), or null when no known
 * concept name is present.
 *
 * Examples of titles we match:
 *   - "Flood Right" → "Flood"
 *   - "Mesh Concept" → "Mesh"
 *   - "Spread Slant-Flat" → "Slant-Flat"
 *   - "Four Verticals 3x1" → "Four Verticals"
 *
 * Returns null for "Stack Left Levels" (no listed concept), "Noah", etc.
 */
const KNOWN_CONCEPTS = [
  "Four Verticals",
  "Slant-Flat",
  "Curl-Flat",
  "Flood",
  "Sail",        // alias of Flood
  "Mesh",
  "Smash",
  "Snag",
  "Levels",
  "Y-Cross",
  "Dagger",
  "Drive",
  "Stick",
];
const CONCEPT_ALIAS: Readonly<Record<string, string>> = {
  Sail: "Flood",
};

export function detectConceptFromTitle(title: string | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  // Longest match first so "Four Verticals" beats "Verticals".
  const sorted = [...KNOWN_CONCEPTS].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (t.includes(c.toLowerCase())) {
      return CONCEPT_ALIAS[c] ?? c;
    }
  }
  return null;
}
