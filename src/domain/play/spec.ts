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
