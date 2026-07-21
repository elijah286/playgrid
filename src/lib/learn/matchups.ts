// Derived concept↔coverage matchups for the library "Strong / weak against"
// section. Per AGENTS.md Rule 6, coverageProfiles.ts is the SINGLE source of
// truth for matchup verdicts — this module only INVERTS it (coverage→concept
// becomes concept→coverage) via the same pure `evaluateMatchup`. No new
// judgment lives here; enrich `coverageProfiles.beaters` to change a verdict.

import { COVERAGE_PROFILES, evaluateMatchup } from "@/domain/play/coverageProfiles";

export type ConceptMatchup = {
  coverage: string;
  /** Grounded one-liner: for `strong`, the soft spot the concept attacks;
   *  for `contested`, the coverage strength to respect. */
  why: string;
  /** Other concepts that beat this coverage (for "better answers" links).
   *  Populated only for contested matchups. */
  alternatives: string[];
};

export type ConceptMatchups = {
  strong: ConceptMatchup[];
  contested: ConceptMatchup[];
  /** True only when the concept is a grounded beater of ≥1 coverage. Run /
   *  RPO / trick concepts beat no coverage (they're graded on box & front,
   *  not shell) → false → the page hides the coverage-matchup section. */
  coverageGraded: boolean;
};

export function conceptMatchups(conceptName: string): ConceptMatchups {
  const strong: ConceptMatchup[] = [];
  const contested: ConceptMatchup[] = [];
  for (const p of COVERAGE_PROFILES) {
    const e = evaluateMatchup({ coverageInput: p.coverage, conceptName });
    if (e.verdict === "favors_offense") {
      strong.push({ coverage: p.coverage, why: p.softSpots[0] ?? "", alternatives: [] });
    } else if (e.verdict === "contested") {
      contested.push({
        coverage: p.coverage,
        why: p.strongSpots[0] ?? "",
        alternatives: e.alternatives,
      });
    }
  }
  return { strong, contested, coverageGraded: strong.length > 0 };
}
