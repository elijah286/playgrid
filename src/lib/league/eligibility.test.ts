import { describe, it, expect } from "vitest";

import { evaluateEligibility, ageOn } from "./eligibility";

describe("evaluateEligibility", () => {
  const div = { name: "10U", minBirthdate: "2014-09-01", maxBirthdate: "2016-08-31" };

  it("is eligible inside the birthdate window", () => {
    const r = evaluateEligibility({ birthdate: "2015-05-10" }, div);
    expect(r).toEqual({ eligible: true, unknown: false, reasons: [] });
  });

  it("is eligible on the inclusive boundaries", () => {
    expect(evaluateEligibility({ birthdate: "2014-09-01" }, div).eligible).toBe(true);
    expect(evaluateEligibility({ birthdate: "2016-08-31" }, div).eligible).toBe(true);
  });

  it("flags too-old (born before the window) with a reason", () => {
    const r = evaluateEligibility({ birthdate: "2014-08-31" }, div);
    expect(r.eligible).toBe(false);
    expect(r.unknown).toBe(false);
    expect(r.reasons[0]).toMatch(/earliest allowed birthdate/);
  });

  it("flags too-young (born after the window) with a reason", () => {
    const r = evaluateEligibility({ birthdate: "2016-09-01" }, div);
    expect(r.eligible).toBe(false);
    expect(r.reasons[0]).toMatch(/latest allowed birthdate/);
  });

  it("returns unknown (not eligible) when birthdate is missing", () => {
    const r = evaluateEligibility({}, div);
    expect(r).toEqual({
      eligible: false,
      unknown: true,
      reasons: ["Player birthdate is required to verify division eligibility."],
    });
  });

  it("treats malformed birthdates as unknown, not a crash", () => {
    expect(evaluateEligibility({ birthdate: "not-a-date" }, div).unknown).toBe(true);
  });

  it("open-ended windows only constrain the side that is set", () => {
    expect(evaluateEligibility({ birthdate: "2000-01-01" }, { maxBirthdate: "2016-08-31" }).eligible).toBe(true);
    expect(evaluateEligibility({ birthdate: "2025-01-01" }, { minBirthdate: "2014-09-01" }).eligible).toBe(true);
  });
});

describe("ageOn", () => {
  it("computes whole-year age before the birthday has passed", () => {
    expect(ageOn("2015-12-01", "2026-06-20")).toBe(10);
  });
  it("computes whole-year age after the birthday has passed", () => {
    expect(ageOn("2015-01-01", "2026-06-20")).toBe(11);
  });
  it("counts the birthday itself", () => {
    expect(ageOn("2015-06-20", "2026-06-20")).toBe(11);
  });
  it("returns null on malformed input", () => {
    expect(ageOn("xx", "2026-06-20")).toBeNull();
  });
});
