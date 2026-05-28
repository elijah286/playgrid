import { describe, it, expect } from "vitest";
import { CONCEPTS } from "./defs/concepts";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { requiredRuleCapabilitiesForConcept } from "./concept-legality";

/**
 * Catalog-consistency invariant (AGENTS.md Rule 1 / Rule 5).
 *
 * A concept must not declare a `variants` entry whose DEFAULT rule-set
 * cannot run it. When it does, the public Library advertises a
 * (concept, variant) page that the compose path (`validatePlaySpecVsRules`)
 * would reject — the exact "QB Draw shown as a flag play" data bug the
 * coach surfaced 2026-05-28.
 *
 * This test enumerates EVERY violation in one shot so the fix (deriving
 * the variant list via `defaultLegalVariantsForConcept`, or trimming the
 * hand-typed arrays) can be reviewed against a concrete list instead of
 * chasing one concept at a time.
 */
describe("concept ↔ variant legality (catalog consistency)", () => {
  it("no concept is offered in a variant its DEFAULT rules forbid", () => {
    const violations: string[] = [];

    for (const concept of CONCEPTS) {
      const required = requiredRuleCapabilitiesForConcept(concept);
      if (required.length === 0) continue;

      for (const variant of concept.variants) {
        const caps = new Set(
          defaultSettingsForVariant(variant).advancedCapabilities,
        );
        const missing = required.filter((c) => !caps.has(c));
        if (missing.length > 0) {
          violations.push(
            `${concept.id} @ ${variant} — declares variant but default rules lack [${missing.join(", ")}]`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
