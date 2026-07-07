import { describe, expect, it } from "vitest";
import { abBucket, resolveExamplePromo } from "./example-promo-config";

describe("resolveExamplePromo", () => {
  it("off → never shows, variant none", () => {
    expect(resolveExamplePromo("off", "user-1")).toEqual({
      show: false,
      variant: "none",
      mode: "off",
    });
  });

  it("everyone → always shows, treatment", () => {
    expect(resolveExamplePromo("everyone", "user-1")).toEqual({
      show: true,
      variant: "treatment",
      mode: "everyone",
    });
  });

  it("no user id → never shows (anonymous / signed-out)", () => {
    expect(resolveExamplePromo("everyone", null).show).toBe(false);
    expect(resolveExamplePromo("ab", undefined).show).toBe(false);
  });

  it("ab → show iff treatment bucket; variant matches bucket", () => {
    const r = resolveExamplePromo("ab", "user-1");
    expect(r.mode).toBe("ab");
    expect(r.variant === "treatment" || r.variant === "control").toBe(true);
    expect(r.show).toBe(r.variant === "treatment");
  });
});

describe("abBucket", () => {
  it("is deterministic for the same id", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(abBucket(id)).toBe(abBucket(id));
  });

  it("splits a population of uuids roughly 50/50", () => {
    // Fixed synthetic ids (no RNG — deterministic test).
    let treatment = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const id = `user-${i}-${(i * 2654435761) >>> 0}`;
      if (abBucket(id) === "treatment") treatment += 1;
    }
    const ratio = treatment / n;
    // Comfortable band around 0.5 for a decent hash.
    expect(ratio).toBeGreaterThan(0.42);
    expect(ratio).toBeLessThan(0.58);
  });
});
