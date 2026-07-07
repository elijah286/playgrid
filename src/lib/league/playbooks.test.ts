import { describe, expect, it } from "vitest";

import { markStaleDistributions } from "./playbooks";

describe("markStaleDistributions", () => {
  it("collapses to one entry per item, keeping the latest copy time", () => {
    const out = markStaleDistributions(
      [
        { itemId: "a", title: "Install 1", at: "2026-07-01T00:00:00Z" },
        { itemId: "a", title: "Install 1", at: "2026-07-03T00:00:00Z" },
      ],
      new Map(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].at).toBe("2026-07-03T00:00:00Z");
  });

  it("flags updateAvailable when the source changed after the latest copy", () => {
    const out = markStaleDistributions(
      [{ itemId: "a", title: "Install 1", at: "2026-07-01T00:00:00Z" }],
      new Map([["a", "2026-07-05T00:00:00Z"]]),
    );
    expect(out[0].updateAvailable).toBe(true);
  });

  it("does not flag when the source is unchanged or older", () => {
    const out = markStaleDistributions(
      [{ itemId: "a", title: "Install 1", at: "2026-07-05T00:00:00Z" }],
      new Map([["a", "2026-07-01T00:00:00Z"]]),
    );
    expect(out[0].updateAvailable).toBe(false);
  });

  it("re-flags after the newest copy even if an older copy was already stale", () => {
    // Redistributed on the 3rd; source last edited the 2nd → not stale anymore.
    const out = markStaleDistributions(
      [
        { itemId: "a", title: "Install 1", at: "2026-07-01T00:00:00Z" },
        { itemId: "a", title: "Install 1", at: "2026-07-03T00:00:00Z" },
      ],
      new Map([["a", "2026-07-02T00:00:00Z"]]),
    );
    expect(out[0].updateAvailable).toBe(false);
  });

  it("never flags a removed library item (itemId null, no source to compare)", () => {
    const out = markStaleDistributions(
      [{ itemId: null, title: "Old install", at: "2026-07-01T00:00:00Z" }],
      new Map([["a", "2026-07-05T00:00:00Z"]]),
    );
    expect(out[0].updateAvailable).toBe(false);
  });

  it("sorts entries by copy time ascending", () => {
    const out = markStaleDistributions(
      [
        { itemId: "b", title: "Red Zone", at: "2026-07-04T00:00:00Z" },
        { itemId: "a", title: "Install 1", at: "2026-07-02T00:00:00Z" },
      ],
      new Map(),
    );
    expect(out.map((d) => d.title)).toEqual(["Install 1", "Red Zone"]);
  });
});
