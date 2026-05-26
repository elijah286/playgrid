// Deterministic daily-rotation for the Football Library featured
// concept. Same concept for everyone all UTC day; rotates at midnight
// UTC automatically. No cron / DB / cache invalidation needed.

import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { ConceptDef } from "@/domain/football-kg/schemas/ConceptDef";

const MS_PER_DAY = 86_400_000;

export function featuredConceptOfTheDay(now: Date = new Date()): ConceptDef {
  const teachable = CONCEPTS.filter(
    (c) => c.complexity === "basic" || c.complexity === "intermediate",
  );
  const pool = teachable.length > 0 ? teachable : CONCEPTS;
  const epochDay = Math.floor(now.getTime() / MS_PER_DAY);
  return pool[epochDay % pool.length];
}
