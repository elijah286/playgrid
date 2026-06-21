import { describe, it, expect } from "vitest";

import {
  DIVISION_AGE_GROUPS,
  DIVISION_GENDERS,
  ageGroupRank,
  isDivisionAgeGroup,
  isDivisionGender,
  segmentSortOrder,
  standardDivisionName,
  standardSeedDivisions,
} from "./divisionCatalog";

describe("standardDivisionName", () => {
  it("uses the bare age band for Co-ed (the default segment)", () => {
    expect(standardDivisionName("10U", "coed")).toBe("10U");
    expect(standardDivisionName("adult", "coed")).toBe("Adult");
  });
  it("appends the gender label for Boys/Girls", () => {
    expect(standardDivisionName("10U", "boys")).toBe("10U Boys");
    expect(standardDivisionName("adult", "girls")).toBe("Adult Girls");
  });
});

describe("ageGroupRank / segmentSortOrder", () => {
  it("ranks age bands youngest-first", () => {
    expect(ageGroupRank("6U")).toBeLessThan(ageGroupRank("18U"));
    expect(ageGroupRank("18U")).toBeLessThan(ageGroupRank("adult"));
  });
  it("sorts unknown bands last", () => {
    expect(ageGroupRank("99U")).toBe(DIVISION_AGE_GROUPS.length);
  });
  it("orders by age band, then Co-ed → Boys → Girls within an age", () => {
    expect(segmentSortOrder("6U", "coed")).toBeLessThan(segmentSortOrder("6U", "boys"));
    expect(segmentSortOrder("6U", "girls")).toBeLessThan(segmentSortOrder("8U", "coed"));
  });
  it("never collides across the whole grid", () => {
    const keys = new Set<number>();
    for (const age of DIVISION_AGE_GROUPS) {
      for (const gender of DIVISION_GENDERS) keys.add(segmentSortOrder(age, gender));
    }
    expect(keys.size).toBe(DIVISION_AGE_GROUPS.length * DIVISION_GENDERS.length);
  });
});

describe("standardSeedDivisions", () => {
  it("seeds Co-ed for every age band, in order, with no duplicates", () => {
    const seed = standardSeedDivisions();
    expect(seed).toHaveLength(DIVISION_AGE_GROUPS.length);
    expect(seed.every((d) => d.gender === "coed")).toBe(true);
    expect(seed.map((d) => d.ageGroup)).toEqual([...DIVISION_AGE_GROUPS]);
    const sorts = seed.map((d) => d.sortOrder);
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
  });
});

describe("guards", () => {
  it("isDivisionGender accepts only catalog genders", () => {
    expect(isDivisionGender("coed")).toBe(true);
    expect(isDivisionGender("nonbinary")).toBe(false);
    expect(isDivisionGender(null)).toBe(false);
  });
  it("isDivisionAgeGroup accepts only catalog age bands", () => {
    expect(isDivisionAgeGroup("10U")).toBe(true);
    expect(isDivisionAgeGroup("9U")).toBe(false);
    expect(isDivisionAgeGroup(undefined)).toBe(false);
  });
});
