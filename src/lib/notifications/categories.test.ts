import { describe, expect, it } from "vitest";
import {
  PUSH_CATEGORIES,
  PUSH_CATEGORY_META,
  isPushCategory,
} from "./categories";

describe("push categories", () => {
  it("has metadata for every category", () => {
    for (const c of PUSH_CATEGORIES) {
      expect(PUSH_CATEGORY_META[c]).toBeTruthy();
      expect(PUSH_CATEGORY_META[c].label.length).toBeGreaterThan(0);
    }
  });

  it("keeps account alerts locked on (critical, non-opt-out)", () => {
    expect(PUSH_CATEGORY_META.account.lockedOn).toBe(true);
  });

  it("scopes site-operations alerts to admins only", () => {
    expect(PUSH_CATEGORY_META.admin_ops.audience).toBe("admin");
    // Everything a normal coach sees is audience "all".
    const userFacing = PUSH_CATEGORIES.filter((c) => PUSH_CATEGORY_META[c].audience === "all");
    expect(userFacing).toContain("team");
    expect(userFacing).toContain("roster_access");
  });

  it("validates category strings", () => {
    expect(isPushCategory("team")).toBe(true);
    expect(isPushCategory("nope")).toBe(false);
  });
});
