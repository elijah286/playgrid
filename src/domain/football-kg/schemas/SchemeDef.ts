/**
 * SchemeDef — a defensive front + coverage combination.
 *
 * Combines what the existing codebase splits across defensiveAlignments
 * (geometry) and the prose KB chunks (semantic explanation). Each scheme
 * stores its full alignment (defenders + zones + per-defender assignments)
 * AND the coaching context (when to use, weaknesses) in one definition.
 *
 * Reactor patterns reference schemes by id; the validator confirms every
 * reactor's `defender` field exists in the scheme's `defenders[]` so
 * coaching cues can't reference defenders that aren't on the field.
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";

/** Per-defender assignment. Mirrors the existing DefenderAssignmentSpec
 *  shape but scoped to KG concerns. */
export type DefenderAssignment =
  | { kind: "zone"; zoneId: string }
  | { kind: "man"; target?: string }  // offensive player id to cover (optional — unspecified = pick at runtime)
  | { kind: "blitz"; gap?: string }
  | { kind: "spy"; target?: string };  // QB spy or specific player

export const DefenderAssignmentZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("zone"), zoneId: z.string().min(1) }),
  z.object({ kind: z.literal("man"), target: z.string().min(1).optional() }),
  z.object({ kind: z.literal("blitz"), gap: z.string().min(1).optional() }),
  z.object({ kind: z.literal("spy"), target: z.string().min(1).optional() }),
]);

/** Defensive zone definition. Renderer paints these as field overlays;
 *  Cal cites them in prose ("@FS owns the deep-third middle"). */
export type DefensiveZone = {
  id: string;
  kind: "rectangle" | "ellipse";
  center: [number, number];
  size: [number, number];
  label: string;
};

export const DefensiveZoneZ = z.object({
  id: z.string().min(1),
  kind: z.enum(["rectangle", "ellipse"]),
  center: z.tuple([z.number(), z.number()]),
  size: z.tuple([z.number(), z.number()]),
  label: z.string().min(1),
});

/** A single defender's placement. `id` is the displayed label (may be
 *  duplicated within a scheme — the renderer suffixes for uniqueness:
 *  two CBs become CB and CB2). */
export type SchemeDefender = {
  id: string;
  x: number;
  y: number;
  assignment: DefenderAssignment;
};

export const SchemeDefenderZ = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  assignment: DefenderAssignmentZ,
});

export type SchemeDef = FootballPrimitiveBase & {
  family: "scheme";
  /** Front name as coaches say it ("4-3 Over", "5v5 Zone", "Nickel"). */
  front: string;
  /** Coverage name ("Cover 1", "Tampa 2", "Cover 3"). */
  coverage: string;
  /** True for man-coverage schemes (Cover 0/1). Skipped for zone schemes
   *  so the renderer knows whether to surface man-targets in prose. */
  manCoverage?: boolean;
  /** Defender placements + assignments. May include duplicate ids
   *  (e.g., two CBs in Cover 3); renderer suffixes on output. */
  defenders: SchemeDefender[];
  /** Zones the defenders occupy. Empty for pure man schemes. */
  zones: DefensiveZone[];
  /** When this scheme is the right call. Surfaces in Cal's
   *  recommendation prose ("Cover 1 is your answer against this because..."). */
  whenToUse?: string;
  /** Known weaknesses — coverages the offense can exploit. Used by Cal
   *  when explaining the matchup to coaches. */
  weaknesses?: string[];
};

export const SchemeDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("scheme"),
  front: z.string().min(1),
  coverage: z.string().min(1),
  manCoverage: z.boolean().optional(),
  defenders: z.array(SchemeDefenderZ).min(1, "scheme must have at least one defender"),
  zones: z.array(DefensiveZoneZ),
  whenToUse: z.string().min(1).optional(),
  weaknesses: z.array(z.string().min(1)).optional(),
});
