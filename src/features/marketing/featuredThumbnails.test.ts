import { describe, it, expect } from "vitest";
import {
  playConceptThumbnail,
  formationThumbnail,
  routeThumbnail,
  defenseThumbnail,
} from "./featuredThumbnails";

// These six builders back the home page Football Library teaser. Each
// must resolve to a REAL diagram (Rule 14: one render path). If a
// catalog rename or skeleton change silently breaks one, the home tile
// would degrade to its gradient fallback — this test catches that.

describe("featured library teaser thumbnails", () => {
  it("renders the Mesh concept (flag 5v5)", () => {
    const t = playConceptThumbnail("Mesh", "flag_5v5");
    expect(t).not.toBeNull();
    expect(t!.players.length).toBeGreaterThan(0);
    expect(t!.routes.length).toBeGreaterThan(0);
  });

  it("renders the Smash concept (flag 7v7)", () => {
    const t = playConceptThumbnail("Smash", "flag_7v7");
    expect(t).not.toBeNull();
    expect(t!.routes.length).toBeGreaterThan(0);
  });

  it("renders the Four Verticals concept (tackle 11)", () => {
    const t = playConceptThumbnail("Four Verticals", "tackle_11");
    expect(t).not.toBeNull();
    expect(t!.routes.length).toBeGreaterThan(0);
  });

  it("renders the Trips formation with release stems on eligible receivers", () => {
    const t = formationThumbnail("Trips", ["flag_7v7", "tackle_11", "flag_6v6", "flag_5v5"]);
    expect(t).not.toBeNull();
    expect(t!.players.length).toBeGreaterThan(0);
    // Short release stems give the alignment vertical body so it frames.
    expect(t!.routes.length).toBeGreaterThan(0);
  });

  it("renders a single Slant route (one runner + QB)", () => {
    const t = routeThumbnail("Slant", "flag_5v5");
    expect(t).not.toBeNull();
    expect(t!.routes.length).toBe(1);
    // QB + route runner only.
    expect(t!.players.length).toBeLessThanOrEqual(2);
  });

  it("renders a defensive coverage with zones", () => {
    const t = defenseThumbnail(["flag_7v7", "tackle_11", "flag_6v6", "flag_5v5"]);
    expect(t).not.toBeNull();
    expect(t!.players.length).toBeGreaterThan(0);
    expect((t!.zones ?? []).length).toBeGreaterThan(0);
  });

  it("returns null for an unknown concept (gradient fallback path)", () => {
    expect(playConceptThumbnail("Not A Real Concept", "flag_5v5")).toBeNull();
    expect(routeThumbnail("Not A Real Route", "flag_5v5")).toBeNull();
  });
});
