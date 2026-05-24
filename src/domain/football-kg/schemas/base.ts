/**
 * Base fields shared by every football primitive (concept, formation,
 * route, scheme, reactor pattern, drill).
 *
 * These fields exist to make the catalog COACH-DISCOVERABLE: the `body`
 * field becomes a KB chunk (Phase 1c auto-generator emits one rag_documents
 * row per primitive), the `name`/`aliases` fields drive name-matching for
 * Cal's intent parsing, and `complexity` drives the (Phase 3) coach-context
 * personalization that surfaces concepts at the right level.
 */

import { z } from "zod";
import {
  ComplexityZ,
  type Complexity,
  type SportVariant,
  SportVariantZ,
} from "./types";

/** Every KG primitive shares this shape. */
export type FootballPrimitiveBase = {
  /** Stable, kebab-case id. Used as primary key + URL slug + lookup key.
   *  Must be unique across all primitives of the same family. */
  id: string;
  /** Coach-facing display name. Renders in the manifest CLI, Cal's prose
   *  citations, and the playbook editor. */
  name: string;
  /** Game variants this primitive applies to. A flag_5v5 concept can be
   *  excluded from tackle_11 lookups by listing only flag_5v5 here. */
  variants: SportVariant[];
  /** One-sentence summary for catalog listings and concept selection
   *  surfaces. Aim for 80-120 characters. */
  description: string;
  /** Multi-sentence coaching prose. THIS becomes the KB chunk content
   *  when `generate-kb-seed` runs. Should read like a coach explaining
   *  the primitive to another coach (when to use it, how to coach it,
   *  what to look for). */
  body: string;
  /** Alternative names coaches might use. The intent parser matches
   *  `name`, then aliases (case-insensitive). E.g., Four Verticals
   *  aliases include "4 Verts", "Verticals", "Quads". */
  aliases?: string[];
  /** Approximate coach-experience tier this primitive is appropriate
   *  for. Used by sub-agents to filter recommendations. Defaults to
   *  "intermediate" if omitted. */
  complexity?: Complexity;
  /** Tags for arbitrary filtering ("man-beater", "vs-zone", "no-back",
   *  "rpo", "screen"). The eval suite uses these to construct scenario
   *  cohorts. */
  tags?: string[];
};

export const FootballPrimitiveBaseZ = z.object({
  id: z.string().regex(
    /^[a-z][a-z0-9-]*$/,
    "id must be kebab-case (lowercase letters, digits, hyphens) starting with a letter",
  ),
  name: z.string().min(1).max(80),
  variants: z.array(SportVariantZ).min(1, "must apply to at least one variant"),
  description: z.string().min(10).max(280),
  body: z.string().min(20, "body should be substantive coaching prose"),
  aliases: z.array(z.string().min(1)).optional(),
  complexity: ComplexityZ.optional(),
  tags: z.array(z.string().min(1)).optional(),
});

/** Brand a base + family discriminator. Used by per-family schemas to
 *  extend with their own fields. */
export type WithFamily<F extends string, T extends object> = FootballPrimitiveBase &
  { family: F } & T;
