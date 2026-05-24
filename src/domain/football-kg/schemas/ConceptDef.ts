/**
 * ConceptDef — a named offensive play concept (Mesh, Smash, Snag, Four
 * Verticals, RPO concepts, run concepts, trick plays).
 *
 * Two-part shape (decided 2026-05-24 during Phase 1b concepts migration):
 *
 *   - PATTERN (matcher): role-based required assignments. Used by the
 *     chat-time validator (assertConcept) to confirm that a diagram
 *     SATISFIES the concept's structural requirements (route families +
 *     depth ranges per role slot). Mirrors the legacy
 *     ConceptCatalog.ConceptEntry.required shape.
 *
 *   - ASSIGNMENTS (builder, optional): per-player route/block/run
 *     assignments. Used by compose_play / generateConceptSkeleton to
 *     produce a complete fence. NOT all concepts need this — pure
 *     run/RPO concepts use the `structural` field instead and let
 *     compose_play derive the play from variant + formation rules.
 *
 *   - STRUCTURAL: non-route requirements (carry kind, RPO read,
 *     ballPath shape). Used by run/RPO/trick-play concepts whose
 *     defining feature isn't the route pattern.
 *
 * Cross-refs validated by load.ts:
 *   - defaultFormation.id exists in formations/
 *   - altFormations[].id exists
 *   - every assignments[].action.routeId (kind: "route") exists in routes/
 *   - every pattern[].family exists in routes (as route NAME, not id —
 *     legacy compat — checked by family-name lookup)
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";
import {
  CapabilityZ,
  SideZ,
  type Capability,
  type Side,
} from "./types";

/** Concept role taxonomy — semantic labels for player ROLES (not specific
 *  player ids). The matcher resolves a role to actual players based on
 *  the formation's roster + position. */
export type ConceptRole = "outside_wr" | "slot" | "te" | "back" | "any";

export const ConceptRoleZ = z.enum(["outside_wr", "slot", "te", "back", "any"]);

/** A single matcher requirement — a player in `role` must run `family`
 *  at a depth inside `depthRangeYds`. The validator checks each diagram
 *  for at least one player satisfying each requirement. */
export type ConceptPatternAssignment = {
  role: ConceptRole;
  /** Catalog route family NAME (e.g. "Curl", "Drag"). Case-insensitive
   *  match against RouteDef.name (preserves legacy lookup behavior). */
  family: string;
  depthRangeYds: { min: number; max: number };
};

export const ConceptPatternAssignmentZ = z.object({
  role: ConceptRoleZ,
  family: z.string().min(1),
  depthRangeYds: z.object({
    min: z.number(),
    max: z.number(),
  }).refine((r) => r.max >= r.min, "depthRangeYds.max must be >= min"),
});

/** Non-route structural requirements — for run / RPO / reverse / trick
 *  play concepts whose defining feature isn't the route pattern.
 *  Mirrors ConceptCatalog.ConceptStructural. */
export type ConceptStructural = {
  requiresCarry?: {
    player?: "qb" | "back" | "any";
    runTypes?: string[];
  };
  requiresRpoRead?: boolean;
  requiresBallPathSteps?: number;
  requiresBallPathReturnsToOrigin?: boolean;
};

export const ConceptStructuralZ = z.object({
  requiresCarry: z.object({
    player: z.enum(["qb", "back", "any"]).optional(),
    runTypes: z.array(z.string().min(1)).optional(),
  }).optional(),
  requiresRpoRead: z.boolean().optional(),
  requiresBallPathSteps: z.number().int().positive().optional(),
  requiresBallPathReturnsToOrigin: z.boolean().optional(),
});

/** Per-player action (builder data). Mirrors AssignmentAction from
 *  src/domain/play/spec.ts but scoped to KG concerns. */
export type PlayerAction =
  | { kind: "route"; routeId: string; depthYds?: number; direction?: Side }
  | { kind: "block"; target?: "edge" | "interior" }
  | { kind: "run"; gap?: string }
  | { kind: "carry"; then?: PlayerAction }
  | { kind: "motion"; toX: number; toY: number; thenAction?: PlayerAction }
  | { kind: "unspecified" };

export const PlayerActionZ: z.ZodType<PlayerAction> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("route"),
      routeId: z.string().regex(/^[a-z][a-z0-9-]*$/, "routeId must be kebab-case"),
      depthYds: z.number().optional(),
      direction: SideZ.optional(),
    }),
    z.object({
      kind: z.literal("block"),
      target: z.enum(["edge", "interior"]).optional(),
    }),
    z.object({
      kind: z.literal("run"),
      gap: z.string().min(1).optional(),
    }),
    z.object({
      kind: z.literal("carry"),
      then: PlayerActionZ.optional(),
    }),
    z.object({
      kind: z.literal("motion"),
      toX: z.number(),
      toY: z.number(),
      thenAction: PlayerActionZ.optional(),
    }),
    z.object({ kind: z.literal("unspecified") }),
  ]),
);

export type PlayerAssignment = {
  player: string;
  action: PlayerAction;
  confidence?: "high" | "medium" | "low";
};

export const PlayerAssignmentZ = z.object({
  player: z.string().min(1),
  action: PlayerActionZ,
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export type ConceptRead = {
  progression: number;
  player: string;
  coverage?: string;
  window: string;
};

export const ConceptReadZ = z.object({
  progression: z.number().int().positive(),
  player: z.string().min(1),
  coverage: z.string().min(1).optional(),
  window: z.string().min(1),
});

export type ConceptDef = FootballPrimitiveBase & {
  family: "concept";
  /** Canonical formation. The id MUST exist in formations/. */
  defaultFormation: { id: string; strength?: Side };
  /** Coach-validated alternative formations. Each id MUST exist. */
  altFormations?: Array<{ id: string; note: string }>;
  /** MATCHER PATTERN — role-based requirements. The chat-time validator
   *  (assertConcept) checks every diagram against this pattern. Run/RPO
   *  concepts may have an empty array if their identity is purely
   *  structural (see `structural` field). */
  pattern: ConceptPatternAssignment[];
  /** When true, every player matched to a required slot must be on the
   *  SAME side of the formation. Used by Flood / Sail. */
  sameSideRequired?: boolean;
  /** Non-route structural requirements (carry / rpo_read / ballPath). */
  structural?: ConceptStructural;
  /** OPTIONAL builder data — per-player assignments used by
   *  compose_play / generateConceptSkeleton. NOT required for pure-
   *  matcher concepts; only present when the KG provides the
   *  composition template directly (vs. delegating to skeleton code). */
  assignments?: PlayerAssignment[];
  /** QB read progression. Optional. */
  reads?: ConceptRead[];
  /** Situational guidance — "use this on 3rd-and-medium vs man press". */
  whenToUse?: string;
  /** Common coaching mistakes Cal should warn about. */
  commonMistakes?: string[];
  /** Capability flags the playbook must have enabled (qbRun, rpoRead,
   *  blocking, trickPlay, etc.). */
  requiresCapabilities?: Capability[];
};

export const ConceptDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("concept"),
  defaultFormation: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    strength: SideZ.optional(),
  }),
  altFormations: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    note: z.string().min(1),
  })).optional(),
  pattern: z.array(ConceptPatternAssignmentZ),
  sameSideRequired: z.boolean().optional(),
  structural: ConceptStructuralZ.optional(),
  assignments: z.array(PlayerAssignmentZ).optional(),
  reads: z.array(ConceptReadZ).optional(),
  whenToUse: z.string().min(1).optional(),
  commonMistakes: z.array(z.string().min(1)).optional(),
  requiresCapabilities: z.array(CapabilityZ).optional(),
}).refine(
  (c) => c.pattern.length > 0 || c.structural,
  "Concept must define either a pattern (route-based) or structural requirements (run/RPO concepts) — having both is fine, having neither is not.",
);
