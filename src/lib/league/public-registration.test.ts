import { describe, expect, it } from "vitest";

import { computeOpen } from "./public-registration";

const DAY = 24 * 60 * 60 * 1000;

describe("computeOpen", () => {
  it("is closed when the window is missing or is_open is false", () => {
    expect(computeOpen(null, 0).open).toBe(false);
    expect(computeOpen({ is_open: false, opens_at: null, closes_at: null }, 0)).toEqual({
      open: false,
      reason: "closed",
    });
  });

  it("is open when is_open and no dates are set", () => {
    expect(computeOpen({ is_open: true, opens_at: null, closes_at: null }, 0)).toEqual({
      open: true,
      reason: null,
    });
  });

  it("is not_started before opens_at", () => {
    const opens = "2026-07-01"; // UTC midnight
    const before = new Date("2026-06-30T12:00:00Z").getTime();
    const after = new Date("2026-07-01T12:00:00Z").getTime();
    expect(computeOpen({ is_open: true, opens_at: opens, closes_at: null }, before).reason).toBe(
      "not_started",
    );
    expect(computeOpen({ is_open: true, opens_at: opens, closes_at: null }, after).open).toBe(true);
  });

  it("treats closes_at as an INCLUSIVE end-of-day boundary (regression: closed hours early in west-of-UTC tz)", () => {
    const closes = "2026-06-25"; // stored as 2026-06-25T00:00:00Z
    const closesMidnightUtc = new Date("2026-06-25T00:00:00Z").getTime();

    // The afternoon BEFORE UTC midnight of the close day — a US-Pacific operator
    // who set "close June 25" must still be OPEN here (it's June 24 evening PT,
    // and even June 25 in UTC). Pre-fix this returned ended.
    const pacificEveningJun24 = closesMidnightUtc - 7 * 60 * 60 * 1000;
    expect(
      computeOpen({ is_open: true, opens_at: null, closes_at: closes }, pacificEveningJun24).open,
    ).toBe(true);

    // Still open at the very end of June 25 UTC (within the inclusive day).
    const endOfJun25 = closesMidnightUtc + DAY - 1000;
    expect(computeOpen({ is_open: true, opens_at: null, closes_at: closes }, endOfJun25).open).toBe(
      true,
    );

    // Closed once June 25 has fully elapsed.
    const jun26 = closesMidnightUtc + DAY + 1000;
    expect(
      computeOpen({ is_open: true, opens_at: null, closes_at: closes }, jun26),
    ).toEqual({ open: false, reason: "ended" });
  });
});
