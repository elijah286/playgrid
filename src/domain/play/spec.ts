/**
 * PlaySpec — the canonical semantic representation of a play.
 *
 * This is the SOURCE OF TRUTH for "what is this play?" — formation,
 * defense, per-player assignments — independent of pixels. Diagrams,
 * prose notes, and KB chunks are all PROJECTIONS of a PlaySpec, never
 * the other way around.
 *
 * Why a separate type from PlayDocument:
 *   - PlayDocument stores rendered geometry (player positions, route
 *     waypoints) — the output of rendering.
 *   - PlaySpec stores intent (formation name, route family, defense
 *     scheme) — the input to rendering.
 *
 * Today PlayDocument is the only persisted form. Phase 2 introduces
 * PlaySpec as a parallel representation that can be derived from a
 * CoachDiagram and rendered back to one. Phase 3+ will make PlaySpec
 * the primary input format Coach Cal emits, with PlayDocument derived.
 *
 * Invariants:
 *   1. Every assignment's `player` MUST match an id in the rendered
 *      formation's roster (validated at render time).
 *   2. Every route assignment's `family` MUST resolve via findTemplate()
 *      (validated at render time + by validateRouteAssignments).
 *   3. Defense (when present) MUST resolve via findDefensiveAlignment()
 *      OR be marked `synthesized: true` (using the live synthesizer).
 *
 * Backwards compatibility:
 *   - The legacy CoachDiagram path (free waypoints) remains supported.
 *   - PlaySpec is round-trip-compatible with CoachDiagram via
 *     coachDiagramToPlaySpec / playSpecToCoachDiagram.
 *   - Loss-of-information cases (custom hand-drawn routes) survive via
 *     the `custom` action kind, which preserves waypoints.
 */

import { z } from "zod";
import type { SportVariant } from "./types";

export const PLAY_SPEC_SCHEMA_VERSION = 1 as const;

/**
 * Confidence attached to spec elements. Drives hedging in projected
 * notes, surfacing in tool result text, and the `explain_play` tool's
 * structural explanation.
 *
 * The parser attaches confidence based on match quality (catalog hit =
 * high, synthesizer fallback = low). Cal can also set it explicitly
 * when authoring (e.g. "low" when guessing at a route the coach
 * described vaguely).
 *
 * Semantics:
 *   - "high"   → primitive matched a catalog entry exactly; no
 *                hedging needed.
 *   - "med"    → primitive resolved but not the cleanest match (alias
 *                used, or partial parse).
 *   - "low"    → fallback, custom-shaped, or unspecified. Notes hedge;
 *                tool results call it out so Cal can confirm with the
 *                coach before claiming success.
 *
 * Default when unset: "high". The parser explicitly downgrades when
 * inputs are fuzzy; absence means "no reason to doubt this."
 */
export type Confidence = "high" | "med" | "low";

/** Reference to a named offensive formation. Resolved at render time via
 *  synthesizeOffense(variant, name). Strength inverts the receiver
 *  distribution + flips TE side. */
export type FormationRef = {
  /** Formation name as a coach would say it ("Spread", "Trips Right",
   *  "Pro I", "Empty", etc). Resolved by parseFormationName + synthesizer. */
  name: string;
  /** Optional explicit strength override. When unset, the synthesizer
   *  derives strength from the name itself ("Trips Right" → right). */
  strength?: "left" | "right" | "balanced";
  /** How sure are we this formation is what was intended? Set "low"
   *  when we fell back to a default (Spread Doubles), "med" when the
   *  coach was vague but synthesizable, "high" otherwise. */
  confidence?: Confidence;
};

/** Reference to a named defensive scheme + coverage. Resolved at render
 *  time via findDefensiveAlignment(variant, front, coverage). */
export type DefenseRef = {
  /** Defensive front ("4-3 Over", "Nickel 4-2-5", "Cover 3", etc). */
  front: string;
  /** Coverage scheme ("Cover 3", "Cover 1", "Tampa 2", etc). When the
   *  front and coverage are the same word (e.g. flag football "Cover 3"),
   *  duplicate them — the catalog matches both. */
  coverage: string;
  /** Strength side. Defaults to "right" (matches catalog authoring). */
  strength?: "left" | "right";
  /** How sure are we about the scheme? "low" when the parser couldn't
   *  classify defenders into a named scheme — render still works, but
   *  Cal should ask the coach before asserting it as a particular scheme. */
  confidence?: Confidence;
};

/** Modifier flags on a route assignment. Keep these structured so the KB
 *  + notes generator can describe them consistently. */
export type RouteModifier =
  | "hot"            // hot route vs blitz
  | "sit_vs_zone"    // settle vs zone, run vs man
  | "option"         // option route (read leverage)
  | "motion"         // pre-snap motion BEFORE this route runs
  | "delayed"        // delayed release (chip/check then route)
  | "rub"            // crossing pick / rub action
  | "alert";         // QB alert / quick-look priority

export type AssignmentAction =
  /** Named catalog route. Family resolves via findTemplate. depthYds
   *  optional override (catalog default applies otherwise). */
  | {
      kind: "route";
      family: string;
      depthYds?: number;
      modifiers?: RouteModifier[];
      /** EXPLICIT user-requested override of catalog depth bounds.
       *  When true, the route-assignment validator allows depthYds
       *  outside the family's canonical range (instead of rejecting)
       *  and surfaces a coaching note ("deeper than canonical drag —
       *  more like a shallow cross"). Use this ONLY when the coach
       *  explicitly requested an unusual depth ("8-yard drag",
       *  "10-yard slant") — never to paper over hallucinated geometry.
       *  The catalog enforcement still catches Cal-authored mistakes;
       *  this flag is the escape hatch for legitimate coach intent. */
      nonCanonical?: boolean;
      /** OPTIONAL direction override for directional families (Flat,
       *  Out, Drag, Wheel, Arrow, etc.). When set, the renderer routes
       *  the path toward the named sideline regardless of the
       *  carrier's natural x sign.
       *
       *  Why this exists: directional family templates default to
       *  "toward the carrier's sideline" (carrier.x >= 0 → right;
       *  x < 0 → left). For most receivers that's correct (an outside
       *  WR's flat goes outside). For backfield carriers (RB, FB)
       *  whose natural x is fixed by the formation synthesizer, this
       *  produces the wrong direction half the time — surfaced
       *  2026-05-02 with Flood Left rendering B's flat to the RIGHT
       *  because B sits at x≈+2 in Spread Doubles regardless of the
       *  play's strength side. Setting `direction: "left"` forces the
       *  flat to flood-left.
       *
       *  Use this only when the route's intended side is logically
       *  decoupled from the carrier's starting x (RB swings,
       *  cross-formation drags). For receivers whose alignment
       *  determines the side, leave it unset and let the template's
       *  natural directionality apply. */
      direction?: "left" | "right";
    }
  /** Pass blocker. target is one of: "edge" (DE/OLB), "interior" (DT/NT),
   *  "blitz" (read-and-pick), or a specific defender label like "ML". */
  | {
      kind: "block";
      target?: "edge" | "interior" | "blitz" | string;
    }
  /** Ballcarrier. type categorizes the run concept. waypoints are the
   *  intended path through the gap (yards). */
  | {
      kind: "carry";
      runType?: "inside_zone" | "outside_zone" | "power" | "counter" | "trap" | "draw" | "sweep" | "qb_keep" | "scramble";
      waypoints?: [number, number][];
    }
  /** Pre-snap motion. into = ending player slot OR an absolute (x, y). */
  | {
      kind: "motion";
      into?: string | { x: number; y: number };
    }
  /** Escape hatch for off-catalog shapes. waypoints stored verbatim;
   *  description carries the coach's intent for prose. ALWAYS prefer a
   *  named action; custom should be rare. */
  | {
      kind: "custom";
      description: string;
      waypoints?: [number, number][];
      curve?: boolean;
    }
  /** Player is in the formation but has no specific assignment in this
   *  play (e.g. a backside lineman in a quick-game look). Empty by design
   *  — preserves the player without lying about what they're doing. */
  | {
      kind: "unspecified";
    }
  /**
   * RPO read — the QB makes a give/keep/throw decision based on a
   * specific defender's reaction. Mounted on the QB's assignment ONLY.
   * The ball-handler (run side) and route runner (pass side) keep their
   * own normal assignments — everyone except the QB runs their job
   * regardless of the QB's choice. That mirrors actual football: an RPO
   * is a QB DECISION layered on top of a run + a route that each fire
   * independently.
   *
   * The renderer draws both branches: a solid arrow from the QB to
   * `giveTo` and the run-side carry path, and a dashed arrow toward the
   * receiver running the pass-side route. The key defender is
   * highlighted so the coach can teach the read.
   *
   * Why a role rather than a defender id: the conflict defender depends
   * on the scheme (vs Cover 3 it's typically the playside OLB; vs Cover
   * 4 it's the safety; vs man it's the nickel). `keyDefenderRole`
   * names the FUNCTION the QB is reading; the defensive alignment
   * catalog resolves the actual defender at render time. This keeps
   * RPOs portable across coverages — same concept, different reads.
   */
  | {
      kind: "rpo_read";
      /** Functional role of the defender the QB is reading. The
       *  defensive alignment catalog supplies a `conflictDefender(role)`
       *  resolver per scheme. */
      keyDefenderRole: "conflict" | "force" | "alley" | "edge" | "playside_lb" | "playside_safety" | "nickel" | string;
      /** Player who receives the ball on the run branch. MUST also have
       *  a `kind: "carry"` assignment of their own — the renderer pairs
       *  the two so the run path is drawn once, not duplicated. */
      giveTo: string;
      /** Player targeted on the pass branch. MUST also have a
       *  `kind: "route"` assignment of their own — same pairing rule. */
      passTo: string;
      /** Decision rule, from the QB's perspective.
       *    - "in"  → pull and throw when the key defender comes IN to
       *              stop the run. Standard bubble / slant / glance RPO.
       *    - "out" → pull and throw when the key defender VACATES
       *              (drops out of run support). Rarer; used when the
       *              RPO is built off a flat-shading look.
       *  Defaults to "in" (the typical RPO). */
      pullIf?: "in" | "out";
    };

export type PlayerAssignment = {
  /** Diagram-local player id (e.g. "X", "Z2", "RB"). MUST match a player
   *  in the rendered formation. */
  player: string;
  action: AssignmentAction;
  /** How sure are we this assignment is correct? Parser sets "low" for
   *  custom or unspecified actions, "high" for catalog routes. Cal may
   *  override when authoring. Hedges prose: "@X likely runs..." vs
   *  "@X runs..." */
  confidence?: Confidence;
};

/**
 * Per-defender action within a play. Parallels offense's
 * `AssignmentAction` — the spec stores intent, the renderer derives
 * geometry.
 *
 * The catalog (defensiveAlignments.ts) supplies a default assignment
 * for every defender in every (front, coverage) entry. Specs only
 * store DEVIATIONS from the catalog defaults: e.g. "Cover 3 base, but
 * ML is on a green-dog blitz this rep." Anything the spec doesn't
 * mention falls back to the catalog at render time.
 *
 * This is why the kinds parallel the catalog's DefenderAssignmentSpec
 * 1:1 — and add `read_and_react` (Phase D7) for offense-conditional
 * movement that catalogs can't express.
 *
 * Loss-of-information escape hatch: `custom_path` mirrors offense's
 * `custom` route — preserves a hand-drawn defender path when a coach
 * draws something off-catalog.
 */
export type DefenderAction =
  /** Drops into a named zone. zoneId references the alignment's
   *  catalog zones (or a renderer-emitted synthesized zone). */
  | { kind: "zone_drop"; zoneId?: string }
  /** Matched on a specific receiver. target is the offensive player id
   *  (e.g. "X", "Z", "RB"). When unset, the renderer infers by
   *  leverage. */
  | { kind: "man_match"; target?: string }
  /** Rushes the QB. gap is the rush lane (A/B/C/D/edge). */
  | { kind: "blitz"; gap?: "A" | "B" | "C" | "D" | "edge" }
  /** Mirrors a specific offensive player (usually QB on QB-runs, or
   *  a dynamic back). */
  | { kind: "spy"; target?: string }
  /** Conditional movement — defender reacts to a specific offensive
   *  action. Phase D7. trigger references an offensive player + their
   *  action; behavior describes the reaction (jump/carry/follow). */
  | {
      kind: "read_and_react";
      trigger: { player: string; on?: "release" | "break" | "snap" };
      behavior: "jump_route" | "carry_vertical" | "follow_to_flat" | "wall_off" | "robber";
    }
  /** Hand-drawn defender path. waypoints in (x,y) yards, anchored from
   *  the defender's catalog position. Use sparingly — prefer named
   *  primitives. */
  | { kind: "custom_path"; description: string; waypoints?: [number, number][]; curve?: boolean };

export type DefenderAssignment = {
  /** Catalog defender id (e.g. "FS", "ML", "CB"). Must match a player
   *  the alignment places. The renderer mirrors x for strength=left,
   *  but the id is stable. */
  defender: string;
  action: DefenderAction;
  /** Confidence — "low" surfaces "(unconfirmed)" hedging in notes. */
  confidence?: Confidence;
};

/**
 * One handoff in a multi-touch ball path (jet sweep, reverse, double
 * reverse, fake reverse, mesh-point exchanges).
 *
 * The play-level `ballPath` is the ORDERED ledger of who has the ball
 * and when they pass it. Each player named anywhere in the chain — both
 * `from` and `to` of every step, including the final receiver — MUST
 * also carry a `kind: "carry"` assignment of their own, whose
 * `waypoints` describe THEIR leg with the ball:
 *
 *   - The first `from` is the snap-receiver (usually QB). Their carry
 *     path runs from their stance to step[0].atPoint.
 *   - Each middle player's carry runs from the prior mesh point to the
 *     next mesh point.
 *   - The final `to` is the destination ballcarrier; their carry path
 *     runs from the last mesh point to the end of their run.
 *
 * This factoring keeps each player's geometry on their own assignment
 * (where the renderer + sanitizer already enforce invariants) and lets
 * `ballPath` stay metadata about the EXCHANGE — it doesn't store any
 * geometry the assignments don't already carry.
 *
 * Example — Trips Right Jet Reverse:
 *   ballPath: [
 *     { from: "QB", to: "RB", atPoint: [0, 0] },
 *     { from: "RB", to: "Z",  atPoint: [3, -1] },
 *   ]
 *   assignments: [
 *     { player: "QB", action: { kind: "block" } },           // stays in / blocks
 *     { player: "RB", action: { kind: "carry", waypoints: [...] } },  // takes mesh1, runs to mesh2
 *     { player: "Z",  action: { kind: "carry", waypoints: [...] } },  // takes mesh2, runs the reverse
 *     ...
 *   ]
 *
 * Variant gate: `ballPath` requires the variant's rules to allow the
 * `handoff_chain` capability (5v5 flag often forbids handoffs). The
 * runtime check lives at the compose/render boundary, not in this
 * schema, so a hand-authored spec with ballPath still parses — the
 * compose-layer validator rejects it for variants that don't opt in.
 */
export type HandoffStep = {
  /** Player giving up the ball. MUST appear in `assignments` (typically
   *  with a `kind: "carry"` action whose path terminates near
   *  `atPoint`). The very first `from` in the chain is the snap
   *  receiver — for a typical play that's the QB. */
  from: string;
  /** Player receiving the ball. */
  to: string;
  /** Where the handoff happens, in (x, y) yards from the LOS. Optional —
   *  the renderer can infer from the surrounding carry waypoints when
   *  omitted, but authoring tools should set it explicitly so the mesh
   *  point is stable across edits. */
  atPoint?: [number, number];
};

/** Optional play-level context. Used by the notes generator + KB lookup
 *  to ground prose in the situation ("3rd-and-7 in the red zone..."). */
export type PlayContext = {
  down?: 1 | 2 | 3 | 4;
  /** Yards to first down. */
  distanceYds?: number;
  /** Field zone — drives KB retrieval scope (red-zone-specific KB chunks
   *  outrank general KB when fieldZone === "red_zone"). */
  fieldZone?: "backed_up" | "open_field" | "fringe" | "red_zone" | "goal_line";
  /** Game-situation tag the coach can attach. */
  tags?: string[];
};

export type PlaySpec = {
  schemaVersion: typeof PLAY_SPEC_SCHEMA_VERSION;
  variant: SportVariant;
  /** Display title — usually formation + concept ("Spread - Slant/Post"). */
  title?: string;
  /** "offense" | "defense" | "special_teams". Mirrors PlayMetadata.playType. */
  playType?: "offense" | "defense" | "special_teams";
  formation: FormationRef;
  defense?: DefenseRef;
  assignments: PlayerAssignment[];
  /**
   * Defensive assignments — DEVIATIONS from the catalog defaults
   * supplied by `spec.defense`. A spec with no defense ref MUST have
   * an empty array here (the renderer will throw if defenderAssignments
   * are present without a defense). Anything not listed inherits its
   * catalog assignment.
   *
   * Invariant: every `defender` MUST match a player id in the alignment
   * resolved by `findDefensiveAlignment(variant, front, coverage)`.
   * Validated at render time by Phase D4's defense validator.
   */
  defenderAssignments?: DefenderAssignment[];
  /**
   * Ordered ledger of ball-handling exchanges. Empty / omitted = single
   * carrier or pass play (the normal case). When present, MUST contain
   * at least one step; each step's `from` and `to` MUST resolve to
   * players in the rendered formation; the geometry of each leg lives
   * on the carrying player's own `kind: "carry"` assignment.
   *
   * See `HandoffStep` for the full data-model contract.
   */
  ballPath?: HandoffStep[];
  context?: PlayContext;
  /** Free-form coach annotations carried through from PlayMetadata.notes.
   *  When set, prose generators MAY use this as input but MUST NOT
   *  contradict the structural assignments above. */
  notes?: string;
};

/** Helper: type-narrow an assignment action. Useful in switch statements
 *  + tests so we get exhaustiveness checking. */
export function isRouteAction(a: AssignmentAction): a is Extract<AssignmentAction, { kind: "route" }> {
  return a.kind === "route";
}
export function isCustomAction(a: AssignmentAction): a is Extract<AssignmentAction, { kind: "custom" }> {
  return a.kind === "custom";
}

// ── Runtime schema (strict) ────────────────────────────────────────────
//
// Used at SFPA tool input boundaries (create_play / update_play when
// play_spec is provided). Anything outside this hierarchy is invalid
// and rejected — see schema.ts header for the contract.

const sportVariantSchema = z.enum(["flag_5v5", "flag_7v7", "tackle_11", "other"]);

const formationRefSchema = z.object({
  name: z.string(),
  strength: z.enum(["left", "right", "balanced"]).optional(),
  confidence: z.enum(["high", "med", "low"]).optional(),
}).strict();

const defenseRefSchema = z.object({
  front: z.string(),
  coverage: z.string(),
  strength: z.enum(["left", "right"]).optional(),
  confidence: z.enum(["high", "med", "low"]).optional(),
}).strict();

const routeModifierSchema = z.enum([
  "hot", "sit_vs_zone", "option", "motion", "delayed", "rub", "alert",
]);

const waypointSchema = z.tuple([z.number(), z.number()]);

const assignmentActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("route"),
    family: z.string(),
    depthYds: z.number().optional(),
    modifiers: z.array(routeModifierSchema).optional(),
    nonCanonical: z.boolean().optional(),
    direction: z.enum(["left", "right"]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("block"),
    target: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal("carry"),
    runType: z.enum([
      "inside_zone", "outside_zone", "power", "counter", "trap",
      "draw", "sweep", "qb_keep", "scramble",
    ]).optional(),
    waypoints: z.array(waypointSchema).optional(),
  }).strict(),
  z.object({
    kind: z.literal("motion"),
    into: z.union([z.string(), z.object({ x: z.number(), y: z.number() }).strict()]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("custom"),
    description: z.string(),
    waypoints: z.array(waypointSchema).optional(),
    curve: z.boolean().optional(),
  }).strict(),
  z.object({
    kind: z.literal("unspecified"),
  }).strict(),
  z.object({
    kind: z.literal("rpo_read"),
    keyDefenderRole: z.string().min(1),
    giveTo: z.string().min(1),
    passTo: z.string().min(1),
    pullIf: z.enum(["in", "out"]).optional(),
  }).strict(),
]);

const handoffStepSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  atPoint: z.tuple([z.number(), z.number()]).optional(),
}).strict();

const playerAssignmentSchema = z.object({
  player: z.string(),
  action: assignmentActionSchema,
  confidence: z.enum(["high", "med", "low"]).optional(),
}).strict();

const defenderActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("zone_drop"),
    zoneId: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal("man_match"),
    target: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal("blitz"),
    gap: z.enum(["A", "B", "C", "D", "edge"]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("spy"),
    target: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal("read_and_react"),
    trigger: z.object({
      player: z.string(),
      on: z.enum(["release", "break", "snap"]).optional(),
    }).strict(),
    behavior: z.enum(["jump_route", "carry_vertical", "follow_to_flat", "wall_off", "robber"]),
  }).strict(),
  z.object({
    kind: z.literal("custom_path"),
    description: z.string(),
    waypoints: z.array(waypointSchema).optional(),
    curve: z.boolean().optional(),
  }).strict(),
]);

const defenderAssignmentSchema = z.object({
  defender: z.string(),
  action: defenderActionSchema,
  confidence: z.enum(["high", "med", "low"]).optional(),
}).strict();

const playContextSchema = z.object({
  down: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  distanceYds: z.number().optional(),
  fieldZone: z.enum(["backed_up", "open_field", "fringe", "red_zone", "goal_line"]).optional(),
  tags: z.array(z.string()).optional(),
}).strict();

export const playSpecSchema = z.object({
  schemaVersion: z.literal(PLAY_SPEC_SCHEMA_VERSION),
  variant: sportVariantSchema,
  title: z.string().optional(),
  playType: z.enum(["offense", "defense", "special_teams"]).optional(),
  formation: formationRefSchema,
  defense: defenseRefSchema.optional(),
  assignments: z.array(playerAssignmentSchema),
  defenderAssignments: z.array(defenderAssignmentSchema).optional(),
  ballPath: z.array(handoffStepSchema).min(1).optional(),
  context: playContextSchema.optional(),
  notes: z.string().optional(),
}).strict();

/** Strict parse of a PlaySpec. Used at the create_play / update_play
 *  tool input boundary. */
export function parsePlaySpec(data: unknown) {
  return playSpecSchema.safeParse(data);
}
