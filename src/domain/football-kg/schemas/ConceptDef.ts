/**
 * ConceptDef — a named offensive play concept (Mesh, Smash, Snag, Four
 * Verticals, etc.).
 *
 * A concept defines:
 *   - a DEFAULT formation it pairs with canonically
 *   - per-player route assignments (each player runs which route, at what depth)
 *   - QB read progression
 *   - coaching context (when to use, common mistakes)
 *
 * Concepts CAN be run from alternative formations — `altFormations` lists
 * coach-validated combos. Cal's tool (compose_play with `formation` override)
 * looks here first; unlisted formations are permitted but flagged as
 * non-canonical.
 *
 * Cross-refs validated by load.ts:
 *   - defaultFormation.id exists in formations/
 *   - altFormations[].id exists
 *   - every assignments[].action.routeId (for kind: "route") exists in routes/
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";
import {
  CapabilityZ,
  SideZ,
  type Capability,
  type Side,
} from "./types";

/** What a player does on a play. Mirrors the existing AssignmentAction
 *  taxonomy from src/domain/play/spec.ts. */
export type PlayerAction =
  | { kind: "route"; routeId: string; depthYds?: number; direction?: Side }
  | { kind: "block"; target?: "edge" | "interior" }
  | { kind: "run"; gap?: string }
  | { kind: "carry"; then?: PlayerAction }  // QB hands off / RB carries
  | { kind: "motion"; toX: number; toY: number; thenAction?: PlayerAction }
  | { kind: "unspecified" };  // QB drop, etc.

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
  /** Role label matching the formation's roster ("X", "Y", "Z", "C", "Q",
   *  "B", "H", "S", etc.). */
  player: string;
  action: PlayerAction;
  /** Confidence in the assignment — high for canonical concept routes,
   *  medium for variant adaptations, low for tentative coverage answers. */
  confidence?: "high" | "medium" | "low";
};

export const PlayerAssignmentZ = z.object({
  player: z.string().min(1),
  action: PlayerActionZ,
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

/** QB read progression. Each entry says: "if you see X coverage, look at
 *  player Y at window Z." Surfaces in Cal's prose when describing how the
 *  play is supposed to be run. */
export type ConceptRead = {
  progression: number;  // 1 = primary, 2 = secondary, etc.
  player: string;
  coverage?: string;  // "vs man", "vs zone", "vs Cover 3", optional
  window: string;  // "underneath at 4yd", "deep middle", "to the flat"
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
  /** Per-player route/block/run assignments. */
  assignments: PlayerAssignment[];
  /** QB read progression. Optional but recommended for pass concepts. */
  reads?: ConceptRead[];
  /** Situational guidance — "use this on 3rd-and-medium vs man press". */
  whenToUse?: string;
  /** Common coaching mistakes Cal should warn about. */
  commonMistakes?: string[];
  /** Capability flags the playbook must have enabled. E.g., a QB Draw
   *  needs "qbRun", an RPO needs "rpoRead". Cal's playbook-capability
   *  gate (existing) reads this. */
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
  assignments: z.array(PlayerAssignmentZ).min(1, "concept must have at least one player assignment"),
  reads: z.array(ConceptReadZ).optional(),
  whenToUse: z.string().min(1).optional(),
  commonMistakes: z.array(z.string().min(1)).optional(),
  requiresCapabilities: z.array(CapabilityZ).optional(),
});
