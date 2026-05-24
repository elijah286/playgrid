/**
 * Football KG — aggregated defs index.
 *
 * Phase 1b builds out each family's defs/ file and re-exports here. As
 * each family migrates, replace the empty arrays with the imported
 * arrays.
 *
 * Sub-phase progress:
 *   - routes: ✅ 26 entries
 *   - schemes: ✅ 19 entries
 *   - formations: pending (Phase 1b — formations)
 *   - concepts: pending (Phase 1b — concepts)
 *   - reactor-patterns: pending (Phase 1b — reactor patterns)
 *   - drills: empty (Phase 5+)
 */

import type { FootballKG } from "../load";
import type { ConceptDef } from "../schemas/ConceptDef";
import type { DrillDef } from "../schemas/DrillDef";
import type { ReactorPatternDef } from "../schemas/ReactorPatternDef";
import { FORMATIONS } from "./formations";
import { ROUTES } from "./routes";
import { SCHEMES } from "./schemes";

const CONCEPTS: ConceptDef[] = []; // populated in Phase 1b — concepts
const REACTOR_PATTERNS: ReactorPatternDef[] = []; // populated in Phase 1b — reactor patterns
const DRILLS: DrillDef[] = []; // populated in Phase 5+

export const FOOTBALL_KG: FootballKG = {
  routes: ROUTES,
  formations: FORMATIONS,
  schemes: SCHEMES,
  concepts: CONCEPTS,
  reactorPatterns: REACTOR_PATTERNS,
  drills: DRILLS,
};

// Re-export the constituent arrays so individual lookups are simple.
export { ROUTES, SCHEMES, FORMATIONS };
