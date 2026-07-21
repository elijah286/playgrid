import { describe, expect, it } from "vitest";
import { auditConceptMatchupProse } from "./matchup-prose-audit";

describe("concept whenToUse ↔ grounded matchup consistency", () => {
  const findings = auditConceptMatchupProse();
  const conflicts = findings.filter((f) => f.kind === "conflict");
  const reviews = findings.filter((f) => f.kind === "review");

  it("no whenToUse tells coaches to avoid a coverage the play actually beats", () => {
    // The Mesh / Flood bug class: prose that contradicts the grounded
    // matchup source. HIGH confidence — a hard gate.
    if (conflicts.length) {
      console.error(
        "MATCHUP PROSE CONFLICTS (fix the whenToUse or the source):\n" +
          conflicts
            .map(
              (f) =>
                `  ${f.concept} — beats ${f.coverage} but whenToUse says: "${f.sentence}"`,
            )
            .join("\n"),
      );
    }
    expect(conflicts).toEqual([]);
  });

  it("fires a conflict when prose negates a coverage the play beats (regression)", () => {
    // Smash is a grounded Cover 2 beater; prose telling coaches to avoid it
    // vs Cover 2 is exactly the Flood-class bug. Proves the gate isn't
    // vacuously green.
    const buggy = [{ name: "Smash", whenToUse: "Good concept, but avoid it vs Cover 2." }];
    const f = auditConceptMatchupProse(buggy);
    expect(
      f.some((x) => x.kind === "conflict" && x.coverage.includes("Cover 2")),
    ).toBe(true);
  });

  it("surfaces lower-confidence positive-claim reviews (likely beater gaps)", () => {
    // NOT a failure: usually a coverageProfiles.beaters gap to vet (e.g.
    // Slant-Flat 'strong vs Cover 2'). Logged so they don't get lost; the
    // count is asserted stable so a NEW one shows up in review.
    if (reviews.length) {
      console.warn(
        "MATCHUP PROSE REVIEWS (vet coverageProfiles.beaters):\n" +
          reviews
            .map(
              (f) =>
                `  ${f.concept} claims vs ${f.coverage} but grounded=${f.verdict}: "${f.sentence}"`,
            )
            .join("\n"),
      );
    }
    // Known, accepted reviews today (Tier-2 deferred calls). Update
    // deliberately when the beater source is enriched.
    expect(reviews.length).toBeLessThanOrEqual(3);
  });
});
