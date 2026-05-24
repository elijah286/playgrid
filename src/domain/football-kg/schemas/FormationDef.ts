/**
 * FormationDef — an offensive personnel arrangement.
 *
 * Player positions are absolute (x = yards from center, y = yards from LOS,
 * negative y = backfield). The renderer drops these directly into the
 * fence's players[] array. No transformation, no inference.
 *
 * Strength encoding: positions are authored as if strength = "right".
 * The renderer mirrors x-coords when the spec specifies strength = "left".
 * Centerline players (|x| < 1) stay put under mirroring.
 *
 * Per-variant overrides exist because field widths + roster sizes differ.
 * E.g., a Bunch in flag_5v5 can't fit 3 receivers to one side AND a
 * backside isolate the way it does in flag_7v7 — the 5v5 version is a
 * compressed bunch with 2 receivers. The KG accommodates this via
 * `variantPositions` overrides.
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";
import { SportVariantZ, SideZ, type SportVariant, type Side } from "./types";

/** A single player's starting position. `onLine` is informational (renderer
 *  uses y === 0 as the structural test); coaches see it surfaced in the
 *  manifest CLI. */
export type FormationPlayerPosition = {
  x: number;
  y: number;
  /** True if the player is ON the line of scrimmage (eligible for outside
   *  release, must be at y === 0). Informational; not enforced separately
   *  from y === 0. */
  onLine: boolean;
};

export const FormationPlayerPositionZ = z.object({
  x: z.number(),
  y: z.number(),
  onLine: z.boolean(),
});

/** Maps role label → starting position. Role labels match the KG's
 *  OffensiveRole union (QB, C, X, Y, Z, H, S, F, B, OL). Variant rules
 *  determine which labels are valid (flag_5v5 canonical = {QB, C, X, Y, Z};
 *  tackle_11 = 11 distinct labels including OL). The validator catches
 *  mismatches per variant. */
export type PlayerLayout = Record<string, FormationPlayerPosition>;

export const PlayerLayoutZ = z.record(z.string(), FormationPlayerPositionZ);

export type FormationDef = FootballPrimitiveBase & {
  family: "formation";
  /** Default player layout (strength = "right"). The renderer mirrors x
   *  for strength = "left". */
  positions: PlayerLayout;
  /** Per-variant overrides for the layout. Use when a variant needs a
   *  fundamentally different roster (5v5 can't fit a real Bunch with 3
   *  WRs one side + backside iso + back). */
  variantPositions?: Partial<Record<SportVariant, PlayerLayout>>;
  /** Default strength. Most formations are "right"; some legacy entries
   *  may specify "left" if the canonical look is left-stronger. */
  strength?: Side;
  /** Strategic tags coaches use to filter ("spread", "compressed",
   *  "no-back", "trips", "diamond", "pistol"). Multi-select; same
   *  formation can have multiple tags. */
  tags?: string[];
};

export const FormationDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("formation"),
  positions: PlayerLayoutZ.refine((p) => Object.keys(p).length >= 2, "formation must have at least 2 players"),
  variantPositions: z.record(SportVariantZ, PlayerLayoutZ).optional(),
  strength: SideZ.optional(),
  tags: z.array(z.string().min(1)).optional(),
});
