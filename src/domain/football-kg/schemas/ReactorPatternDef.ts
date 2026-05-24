/**
 * ReactorPatternDef — how a defensive scheme reacts to a specific
 * offensive concept.
 *
 * When `compose_defense` overlays a defense onto an offensive play, the
 * reactor catalog supplies per-defender movement routes (driving downhill
 * on a slant, carrying the vertical, walling off a crosser). These make
 * the defense LOOK like it's actively defending — not just static dots.
 *
 * Cross-refs validated by load.ts:
 *   - schemeId exists in schemes/
 *   - conceptId exists in concepts/ (or is "*" for wildcard like Cover 0
 *     vs everything)
 *   - every reactors[].defender appears in the referenced scheme's
 *     defenders[] (so coaching cues can't reference a defender that
 *     isn't on the field)
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";
import { SportVariantZ, type SportVariant } from "./types";

/** Behavior taxonomy — drives the renderer's defender movement arrows. */
export type ReactorBehavior =
  | "jump_route"      // drive downhill on a receiver's break
  | "carry_vertical"  // stay over the top of a vertical route
  | "follow_to_flat"  // chase a route to the flat
  | "wall_off"        // re-route a crosser
  | "robber";         // sit in a high-traffic zone

export const ReactorBehaviorZ = z.enum([
  "jump_route",
  "carry_vertical",
  "follow_to_flat",
  "wall_off",
  "robber",
]);

/** A single defender's reaction to the offensive concept. */
export type Reactor = {
  /** Defender id from the matching scheme's defenders[]. */
  defender: string;
  /** Offensive player id that triggers the reaction. */
  trigger: string;
  behavior: ReactorBehavior;
  /** 1-line coaching cue surfaced in defense prose. */
  cue: string;
};

export const ReactorZ = z.object({
  defender: z.string().min(1),
  trigger: z.string().min(1),
  behavior: ReactorBehaviorZ,
  cue: z.string().min(5),
});

export type ReactorPatternDef = FootballPrimitiveBase & {
  family: "reactor-pattern";
  /** Variant this pattern applies to — reactor patterns are per-variant
   *  because defender labels differ (flag_7v7 has M, tackle_11 has MLB,
   *  flag_5v5 has FL/FR). */
  variant: SportVariant;
  /** Scheme id this pattern reacts FROM. */
  schemeId: string;
  /** Concept id this pattern reacts TO. "*" matches any concept (used by
   *  Cover 0 — all-out blitz behaves the same against everything). */
  conceptId: string;
  /** Per-defender reactions. */
  reactors: Reactor[];
};

export const ReactorPatternDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("reactor-pattern"),
  variant: SportVariantZ,
  schemeId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  conceptId: z.string().regex(/^([a-z][a-z0-9-]*|\*)$/, "must be kebab-case id or '*' wildcard"),
  reactors: z.array(ReactorZ),
});
