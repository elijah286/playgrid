// Deterministic daily-rotation for the Football Library featured
// concept. Same concept for everyone all UTC day; rotates at midnight
// UTC automatically. No cron / DB / cache invalidation needed.

import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { ConceptDef } from "@/domain/football-kg/schemas/ConceptDef";
import type { LibraryVariant } from "./variant";

const MS_PER_DAY = 86_400_000;

/**
 * Pick today's featured concept. When `variant` is provided, the pool
 * is restricted to concepts that support that variant — so a coach on
 * 5v5 Flag sees a 5v5-capable concept, and a coach on 11v11 Tackle
 * sees a tackle-capable one. Defaults to the legacy "any variant"
 * pool when no variant is passed (used by surfaces that aren't
 * variant-scoped).
 */
export function featuredConceptOfTheDay(
  now: Date = new Date(),
  variant?: LibraryVariant,
): ConceptDef {
  const teachable = CONCEPTS.filter(
    (c) =>
      (c.complexity === "basic" || c.complexity === "intermediate") &&
      (!variant || (c.variants ?? []).includes(variant)),
  );
  // Fall back to any teachable concept if the variant pool is empty
  // (shouldn't happen for the canonical 4 variants today, but
  // defensive — e.g. a future variant with no seeded basics).
  const allTeachable = CONCEPTS.filter(
    (c) => c.complexity === "basic" || c.complexity === "intermediate",
  );
  const pool =
    teachable.length > 0
      ? teachable
      : allTeachable.length > 0
        ? allTeachable
        : CONCEPTS;
  const epochDay = Math.floor(now.getTime() / MS_PER_DAY);
  return pool[epochDay % pool.length];
}
