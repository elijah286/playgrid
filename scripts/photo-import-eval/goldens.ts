/**
 * Golden-label types + loader for the photo-import eval.
 *
 * A golden is the TRUTH for one play panel, authored by a human (the
 * coach, ultimately). Fields mirror the extraction schema so scoring is
 * a direct comparison, with two additions:
 *
 *   - `alternates`: families that also count as correct. A photographed
 *     break angle can be legitimately readable as two families (Corner
 *     vs deep Out); when the coach says either is acceptable, the eval
 *     should not punish the model for picking the other one.
 *   - `verified`: false until a human has confirmed the label against
 *     the physical sheet. The report scores verified and unverified
 *     plays separately — unverified numbers are provisional, since the
 *     goldens themselves started as a model read (see GOLDENS-REVIEW.md).
 */

import fs from "node:fs";
import { z } from "zod";

const goldenAssignmentSchema = z
  .object({
    player: z.string().min(1),
    kind: z.enum(["route", "block", "carry", "motion", "unclear"]),
    family: z.string().optional(),
    alternates: z.array(z.string()).optional(),
    depthYds: z.number().optional(),
    /** Yards of slack allowed on depth before it counts as a miss.
     *  Defaults to DEFAULT_DEPTH_TOL_YDS in the scorer. */
    depthTolYds: z.number().optional(),
    direction: z.enum(["left", "right"]).optional(),
    modifiers: z.array(z.string()).optional(),
  })
  .strict();
export type GoldenAssignment = z.infer<typeof goldenAssignmentSchema>;

const goldenPlaySchema = z
  .object({
    /** 1-based, matches the sheet's printed "Play N". */
    index: z.number().int().min(1),
    verified: z.boolean(),
    formation: z
      .object({
        name: z.string().min(1),
        alternates: z.array(z.string()).optional(),
        strength: z.enum(["left", "right", "balanced"]).optional(),
      })
      .strict(),
    assignments: z.array(goldenAssignmentSchema).min(1),
    ambiguities: z.array(z.string()).optional(),
    reviewNotes: z.string().optional(),
  })
  .strict();
export type GoldenPlay = z.infer<typeof goldenPlaySchema>;

const goldenSheetSchema = z
  .object({
    sheet: z.string(),
    variant: z.string(),
    source: z.string().optional(),
    grid: z
      .object({
        rows: z.number().int().min(1),
        cols: z.number().int().min(1),
        region: z
          .object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() })
          .strict()
          .optional(),
      })
      .strict(),
    plays: z.array(goldenPlaySchema).min(1),
  })
  .strict();
export type GoldenSheet = z.infer<typeof goldenSheetSchema>;

export function loadGoldens(file: string): GoldenSheet {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const parsed = goldenSheetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`goldens file ${file} failed validation:\n${parsed.error.message}`);
  }
  const indices = parsed.data.plays.map((p) => p.index);
  if (new Set(indices).size !== indices.length) {
    throw new Error(`goldens file ${file} has duplicate play indices`);
  }
  return parsed.data;
}
