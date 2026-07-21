// Consistency guard: does a concept's free-text `whenToUse` make a COVERAGE
// claim that contradicts the grounded matchup verdict (coverageProfiles.ts,
// the single source of truth, Rule 6)?
//
// Motivation: the 2026-07 enrichment pass found two live bugs by hand —
// Mesh ("Cover 2 with a deep middle safety") and Flood ("doesn't beat
// 2-shell" while it beats Cover 2 / Tampa 2). Auditing 4 concepts surfaced 2
// bugs, so the rest of that class is worth catching mechanically.
//
// Heuristic, and deliberately conservative:
//   - "conflict"  = HIGH confidence: negative language ("avoid", "doesn't
//     beat") aimed at a coverage/shell the play IS a grounded beater of. The
//     test asserts ZERO of these (that's the Flood class).
//   - "review"    = LOWER confidence: positive language ("best vs", "beats")
//     aimed at a shell the play beats NONE of. Usually a
//     coverageProfiles.beaters GAP to vet (e.g. Slant-Flat "strong vs Cover
//     2"), not a prose bug — surfaced for humans, not failed.
//
// Shell synonyms ("two-deep", "man", "single-high") map to every coverage of
// that shell, and a positive claim is satisfied if the play beats ANY of
// them (so "answer to man" isn't flagged when the play beats Cover 0 but not
// Cover 1).

import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { COVERAGE_PROFILES, evaluateMatchup } from "@/domain/play/coverageProfiles";

// coverageProfiles is the source; keep a compile-time nudge that these names
// stay in sync if the catalog is renamed.
const KNOWN = new Set(COVERAGE_PROFILES.map((p) => p.coverage));

type Matcher = { coverages: string[]; re: RegExp };

const COVERAGE_MATCHERS: Matcher[] = [
  { coverages: ["Cover 0"], re: /\bcover ?0\b|\bc0\b|zero blitz|all-out blitz/i },
  { coverages: ["Cover 1"], re: /\bcover ?1\b|\bc1\b|man[- ]free/i },
  { coverages: ["Cover 2"], re: /\bcover ?2\b|\bc2\b/i },
  { coverages: ["Tampa 2"], re: /\btampa ?2\b/i },
  { coverages: ["Cover 3"], re: /\bcover ?3\b|\bc3\b/i },
  { coverages: ["Cover 4"], re: /\bcover ?4\b|\bc4\b|quarters?\b/i },
  // Shell synonyms → every coverage of that shell.
  { coverages: ["Cover 2", "Tampa 2"], re: /two[- ]deep|2[- ]shell|two deep safet/i },
  { coverages: ["Cover 0", "Cover 1"], re: /\bman\b|press man|man coverage|man across/i },
  { coverages: ["Cover 1", "Cover 3"], re: /single[- ]high/i },
];

const NEG =
  /\b(avoid|does(?:n'?t| not) beat|won'?t beat|can'?t beat|not a[^.]{0,25}beater|struggles?)\b/i;
const POS =
  /\b(best vs|beats?|killer|answer to|strong vs|great vs|deadly vs|excellent (?:answer|vs))\b/i;

export type ProseFinding = {
  concept: string;
  /** Coverage(s) the finding is about (comma-joined). */
  coverage: string;
  kind: "conflict" | "review";
  verdict: string;
  sentence: string;
};

export function auditConceptMatchupProse(
  concepts: ReadonlyArray<{ name: string; whenToUse?: string }> = CONCEPTS,
): ProseFinding[] {
  const findings: ProseFinding[] = [];
  for (const c of concepts) {
    if (!c.whenToUse) continue;
    const sentences = c.whenToUse
      .split(/[.;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      const neg = NEG.test(sentence);
      const pos = !neg && POS.test(sentence);
      if (!neg && !pos) continue;
      for (const m of COVERAGE_MATCHERS) {
        if (!m.re.test(sentence)) continue;
        const verdicts = m.coverages
          .filter((cov) => KNOWN.has(cov))
          .map((cov) => ({
            cov,
            verdict: evaluateMatchup({ coverageInput: cov, conceptName: c.name }).verdict,
          }));
        const beaten = verdicts.filter((v) => v.verdict === "favors_offense");
        if (neg && beaten.length > 0) {
          findings.push({
            concept: c.name,
            kind: "conflict",
            coverage: beaten.map((b) => b.cov).join(", "),
            verdict: "favors_offense",
            sentence,
          });
        } else if (pos && verdicts.length > 0 && beaten.length === 0) {
          findings.push({
            concept: c.name,
            kind: "review",
            coverage: verdicts.map((v) => v.cov).join(", "),
            verdict: verdicts[0].verdict,
            sentence,
          });
        }
      }
    }
  }
  // Dedup identical (concept, kind, coverage, sentence) tuples.
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.concept}|${f.kind}|${f.coverage}|${f.sentence}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
