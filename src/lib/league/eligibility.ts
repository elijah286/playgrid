/**
 * Division eligibility (Track A) — pure logic, no I/O, fully unit-tested.
 *
 * Eligibility is a SOFT signal: an ineligible result is surfaced to the operator
 * as a warning with reasons, not a hard block (youth leagues need operator
 * discretion — see PLAN.md open question #1). Dates are ISO `YYYY-MM-DD`, which
 * compare correctly as strings, so this stays deterministic and Date-free.
 */

export type EligibilityInput = {
  birthdate?: string | null;
};

export type DivisionWindow = {
  name?: string;
  /** Earliest allowed birthdate (inclusive). */
  minBirthdate?: string | null;
  /** Latest allowed birthdate (inclusive). */
  maxBirthdate?: string | null;
};

export type EligibilityResult = {
  eligible: boolean;
  /** True when birthdate is missing and eligibility can't be determined. */
  unknown: boolean;
  reasons: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function evaluateEligibility(
  player: EligibilityInput,
  division: DivisionWindow,
): EligibilityResult {
  const birthdate = player.birthdate?.trim();

  if (!birthdate || !ISO_DATE.test(birthdate)) {
    return {
      eligible: false,
      unknown: true,
      reasons: ["Player birthdate is required to verify division eligibility."],
    };
  }

  const reasons: string[] = [];
  let eligible = true;
  const where = division.name ? `the ${division.name} division` : "this division";

  if (division.minBirthdate && birthdate < division.minBirthdate) {
    eligible = false;
    reasons.push(
      `Born before ${where}'s earliest allowed birthdate (${division.minBirthdate}).`,
    );
  }
  if (division.maxBirthdate && birthdate > division.maxBirthdate) {
    eligible = false;
    reasons.push(
      `Born after ${where}'s latest allowed birthdate (${division.maxBirthdate}).`,
    );
  }

  return { eligible, unknown: false, reasons };
}

/**
 * Whole-year age on a given date. Pure (no Date) so it's deterministic in tests.
 * Both args are ISO `YYYY-MM-DD`. Returns null on malformed input.
 */
export function ageOn(birthdate: string, asOf: string): number | null {
  if (!ISO_DATE.test(birthdate) || !ISO_DATE.test(asOf)) return null;
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age -= 1;
  return age;
}
