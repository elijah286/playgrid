import { describe, expect, it } from "vitest";
import { routeCoachingCues } from "./notes-from-spec";

describe("routeCoachingCues (library routes accessor)", () => {
  it("returns the cue + coverage reads for a covered route (Hitch)", () => {
    const c = routeCoachingCues("Hitch");
    expect(c.cue).toBeTruthy();
    expect(c.byCoverage.length).toBeGreaterThan(0);
    expect(c.byCoverage.every((x) => x.coverage && x.cue)).toBe(true);
  });

  it("is case-insensitive on the route name", () => {
    expect(routeCoachingCues("hitch").cue).toBe(routeCoachingCues("HITCH").cue);
  });

  it("returns cue + coverage reads for an enriched route (Bubble)", () => {
    const c = routeCoachingCues("Bubble");
    expect(c.cue).toBeTruthy();
    expect(c.byCoverage.length).toBeGreaterThan(0);
  });

  it("returns empty for an unknown route", () => {
    expect(routeCoachingCues("Not A Route")).toEqual({ cue: null, byCoverage: [] });
  });
});
