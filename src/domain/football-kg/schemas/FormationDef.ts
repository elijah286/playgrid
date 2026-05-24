/**
 * FormationDef — an offensive personnel arrangement.
 *
 * Hybrid schema (decided 2026-05-24, per roadmap "open design question"):
 * formations can be defined in EITHER mode (or both):
 *
 *   - SPEC mode (parametric — for variant-portable formations like Doubles,
 *     Trips, Bunch, Empty). Stores the structural recipe (qb depth +
 *     backs + receiver distribution); positions are derived per-variant
 *     at render time. Same structural model as the existing
 *     `offensiveSynthesize.ts` parser, but as DATA in the KG.
 *
 *   - CUSTOM SHAPE mode (predefined non-parametric layouts — Diamond,
 *     Tight Diamond, Stack-I). The renderer has a dedicated placer for
 *     each shape that produces variant-appropriate positions. Stored as
 *     a discriminator value.
 *
 *   - STATIC POSITIONS mode (fully-explicit — for one-off formations
 *     that don't fit either of the above). Stores per-variant
 *     position maps. Last resort.
 *
 * At least ONE of {spec, customShape, positions} MUST be set. The
 * validator enforces this. Most formations use exactly one mode;
 * `variantPositions` overrides + `spec` together cover formations
 * where the parametric default is right for most variants but one
 * needs an explicit override.
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";
import { SportVariantZ, SideZ, type SportVariant, type Side } from "./types";

/** A single player's starting position. */
export type FormationPlayerPosition = {
  x: number;
  y: number;
  /** True if the player is ON the line of scrimmage (eligible for outside
   *  release, must be at y === 0). Informational. */
  onLine: boolean;
};

export const FormationPlayerPositionZ = z.object({
  x: z.number(),
  y: z.number(),
  onLine: z.boolean(),
});

/** Role label → starting position map. */
export type PlayerLayout = Record<string, FormationPlayerPosition>;

export const PlayerLayoutZ = z.record(z.string(), FormationPlayerPositionZ);

/** Parametric structural spec — qb depth, back arrangement, receiver
 *  distribution. Mirrors the existing FormationSpec from
 *  `offensiveSynthesize.ts`. The renderer applies this spec + a variant
 *  to derive positions. */
export type FormationSpec = {
  qb: "shotgun" | "under_center" | "pistol";
  backs: "none" | "single" | "i_stack" | "wishbone" | "t_row" | "split";
  receivers: {
    left: number;
    right: number;
    te: 0 | 1;
    bunchSide?: "left" | "right";
  };
};

export const FormationSpecZ = z.object({
  qb: z.enum(["shotgun", "under_center", "pistol"]),
  backs: z.enum(["none", "single", "i_stack", "wishbone", "t_row", "split"]),
  receivers: z.object({
    left: z.number().int().nonnegative(),
    right: z.number().int().nonnegative(),
    te: z.union([z.literal(0), z.literal(1)]),
    bunchSide: SideZ.optional(),
  }),
});

/** Non-parametric layouts with dedicated placement logic. Each shape
 *  has a hardcoded variant-aware placer in the renderer
 *  (placeCustomShape in offensiveSynthesize.ts). */
export type CustomShape = "diamond" | "tight_diamond" | "stack_i";

export const CustomShapeZ = z.enum(["diamond", "tight_diamond", "stack_i"]);

export type FormationDef = FootballPrimitiveBase & {
  family: "formation";
  /** Parametric structural recipe. The renderer derives variant-specific
   *  positions from this. Use when the formation has the same logical
   *  shape across variants (just scaled for field width / roster). */
  spec?: FormationSpec;
  /** Custom shape selector. The renderer's placeCustomShape handles each
   *  named shape. Use when the formation doesn't fit the parametric
   *  qb/backs/receivers model. */
  customShape?: CustomShape;
  /** Explicit per-role positions. Use when neither spec nor customShape
   *  fits. Variant-agnostic positions go here; per-variant overrides
   *  go in variantPositions. */
  positions?: PlayerLayout;
  /** Per-variant position overrides. Layered on top of `positions` (or
   *  on top of the spec-derived layout) for variants that need a
   *  different roster shape. */
  variantPositions?: Partial<Record<SportVariant, PlayerLayout>>;
  /** Default strength. Most formations are "right"; the renderer mirrors
   *  x-coords for "left" strength. */
  strength?: Side;
  /** Tags coaches use to filter ("spread", "compressed", "no-back",
   *  "trips", "diamond", "pistol", "bunch"). */
  tags?: string[];
};

export const FormationDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("formation"),
  spec: FormationSpecZ.optional(),
  customShape: CustomShapeZ.optional(),
  positions: PlayerLayoutZ.optional(),
  variantPositions: z.record(SportVariantZ, PlayerLayoutZ).optional(),
  strength: SideZ.optional(),
  tags: z.array(z.string().min(1)).optional(),
}).refine(
  (f) => f.spec || f.customShape || f.positions,
  "FormationDef must define at least one of: spec, customShape, positions",
);
