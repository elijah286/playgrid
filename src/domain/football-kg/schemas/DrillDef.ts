/**
 * DrillDef — a practice drill.
 *
 * Defined alongside the play primitives so practice planning (Phase 5)
 * has a structured source of truth. Initially focused on skills (route
 * running, blocking, defense flow) and situational reps (red zone, 2-minute,
 * goal line). Cal will use these via PracticePlanner sub-agent (Phase 5)
 * to assemble multi-day install sequences.
 *
 * Drills don't cross-reference concepts directly (a drill can support
 * multiple concepts), but they DO tag the skills they develop — Cal
 * matches "concept needs receivers to run sharp slants" → drill
 * tagged "route-precision" + "slant". Loose coupling.
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";

/** What kind of skill or rep this drill develops. */
export type DrillFocus =
  | "blocking"
  | "receiving"
  | "route-precision"
  | "qb-mechanics"
  | "qb-reads"
  | "defense-flow"
  | "defense-coverage"
  | "tackling"   // tackle variants only
  | "flag-pulling"  // flag variants
  | "conditioning"
  | "situational-reps"
  | "team-build";

export const DrillFocusZ = z.enum([
  "blocking",
  "receiving",
  "route-precision",
  "qb-mechanics",
  "qb-reads",
  "defense-flow",
  "defense-coverage",
  "tackling",
  "flag-pulling",
  "conditioning",
  "situational-reps",
  "team-build",
]);

export type DrillDef = FootballPrimitiveBase & {
  family: "drill";
  /** Primary focus area. Multi-focus drills list the dominant one;
   *  secondary foci go in `tags`. */
  focus: DrillFocus;
  durationMinutes: number;
  playersNeeded: { min: number; max: number };
  /** Equipment required ("cones", "agility-ladder", "blocking-pads",
   *  "footballs"). */
  equipment: string[];
  /** Step-by-step procedure as multi-line coaching text. */
  procedure: string;
  /** Variations to scale up/down or focus differently. */
  variations?: Array<{ name: string; description: string }>;
  /** Recommended age range. Used by PracticePlanner to surface
   *  age-appropriate drills. */
  ageRange?: { min: number; max: number };
};

export const DrillDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("drill"),
  focus: DrillFocusZ,
  durationMinutes: z.number().int().positive().max(120),
  playersNeeded: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }).refine((p) => p.max >= p.min, "playersNeeded.max must be >= min"),
  equipment: z.array(z.string().min(1)),
  procedure: z.string().min(30),
  variations: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(10),
  })).optional(),
  ageRange: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }).refine((p) => p.max >= p.min, "ageRange.max must be >= min").optional(),
});
