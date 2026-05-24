/**
 * Football KG — aggregated defs index.
 *
 * Phase 1b builds out each family's defs/ file and re-exports here. As
 * each family migrates, replace the empty arrays with the imported
 * arrays.
 *
 * Sub-phase progress:
 *   - routes: 26 entries migrated (Phase 1b — routes)
 *   - formations: pending (Phase 1b — formations)
 *   - schemes: pending (Phase 1b — defensive schemes)
 *   - concepts: pending (Phase 1b — concepts)
 *   - reactor-patterns: pending (Phase 1b — reactor patterns)
 *   - drills: empty (Phase 5+)
 */

import type { FootballKG } from "../load";
import type { ConceptDef } from "../schemas/ConceptDef";
import type { DrillDef } from "../schemas/DrillDef";
import type { FormationDef } from "../schemas/FormationDef";
import type { ReactorPatternDef } from "../schemas/ReactorPatternDef";
import type { ReactorPatternDef as _ReactorPatternDef } from "../schemas/ReactorPatternDef";
import type { SchemeDef } from "../schemas/SchemeDef";
import { ROUTES } from "./routes";

const FORMATIONS: FormationDef[] = []; // populated in Phase 1b — formations
const SCHEMES: SchemeDef[] = []; // populated in Phase 1b — defensive schemes
const CONCEPTS: ConceptDef[] = []; // populated in Phase 1b — concepts
const REACTOR_PATTERNS: ReactorPatternDef[] = []; // populated in Phase 1b — reactor patterns
const DRILLS: DrillDef[] = []; // populated in Phase 5+

// Suppress unused-import warning while Phase 1b is in progress.
type _Unused = _ReactorPatternDef;

export const FOOTBALL_KG: FootballKG = {
  routes: ROUTES,
  formations: FORMATIONS,
  schemes: SCHEMES,
  concepts: CONCEPTS,
  reactorPatterns: REACTOR_PATTERNS,
  drills: DRILLS,
};

// Re-export the constituent arrays so individual lookups are simple.
export { ROUTES };
