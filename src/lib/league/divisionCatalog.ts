/**
 * Division catalog — the single source of truth (in code) for the standard
 * divisions every league starts from.
 *
 * A league's divisions are a Gender × Age grid. Co-ed is seeded for a new
 * league; Boys/Girls variants are added on demand. The catalog is sport-agnostic
 * on purpose (no football-only concepts) so the same grid powers every sport.
 *
 * Pure + I/O-free so it's fully unit-tested and safe to import on client or
 * server. Persistence shape lives in the `league_divisions` table
 * (gender / age_group / active columns).
 */

export const DIVISION_GENDERS = ["coed", "boys", "girls"] as const;
export type DivisionGender = (typeof DIVISION_GENDERS)[number];

// 6U…18U plus an open "adult" band. Order here IS the display/sort order.
export const DIVISION_AGE_GROUPS = [
  "6U",
  "8U",
  "10U",
  "12U",
  "14U",
  "16U",
  "18U",
  "adult",
] as const;
export type DivisionAgeGroup = (typeof DIVISION_AGE_GROUPS)[number];

export const GENDER_LABEL: Record<DivisionGender, string> = {
  coed: "Co-ed",
  boys: "Boys",
  girls: "Girls",
};

export const AGE_GROUP_LABEL: Record<DivisionAgeGroup, string> = {
  "6U": "6U",
  "8U": "8U",
  "10U": "10U",
  "12U": "12U",
  "14U": "14U",
  "16U": "16U",
  "18U": "18U",
  adult: "Adult",
};

/** The gender seeded (active) for a brand-new league — the rest are opt-in. */
export const SEED_GENDER: DivisionGender = "coed";

export function isDivisionGender(v: unknown): v is DivisionGender {
  return typeof v === "string" && (DIVISION_GENDERS as readonly string[]).includes(v);
}

export function isDivisionAgeGroup(v: unknown): v is DivisionAgeGroup {
  return typeof v === "string" && (DIVISION_AGE_GROUPS as readonly string[]).includes(v);
}

/** Canonical display name, e.g. "10U", "10U Boys", "Adult Girls". */
export function standardDivisionName(age: DivisionAgeGroup, gender: DivisionGender): string {
  const a = AGE_GROUP_LABEL[age];
  return gender === "coed" ? a : `${a} ${GENDER_LABEL[gender]}`;
}

/** Position of an age band in the canonical order (unknown bands sort last). */
export function ageGroupRank(age: string): number {
  const i = (DIVISION_AGE_GROUPS as readonly string[]).indexOf(age);
  return i === -1 ? DIVISION_AGE_GROUPS.length : i;
}

/**
 * Stable sort key for a standard segment: ordered by age band, then
 * Co-ed → Boys → Girls within an age. Keeps the grid grouped no matter the
 * order segments were created in.
 */
export function segmentSortOrder(age: DivisionAgeGroup, gender: DivisionGender): number {
  return ageGroupRank(age) * DIVISION_GENDERS.length + DIVISION_GENDERS.indexOf(gender);
}

export type StandardSeedDivision = {
  name: string;
  gender: DivisionGender;
  ageGroup: DivisionAgeGroup;
  sortOrder: number;
};

/** The seed set for a new league: Co-ed across every age band, in order. */
export function standardSeedDivisions(): StandardSeedDivision[] {
  return DIVISION_AGE_GROUPS.map((age) => ({
    name: standardDivisionName(age, SEED_GENDER),
    gender: SEED_GENDER,
    ageGroup: age,
    sortOrder: segmentSortOrder(age, SEED_GENDER),
  }));
}
