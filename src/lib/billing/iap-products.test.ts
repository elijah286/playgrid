import { describe, it, expect } from "vitest";
import {
  productForStoreId,
  storeIdForTier,
  IAP_COACH_MONTHLY,
  IAP_COACH_ANNUAL,
  IAP_PRODUCTS,
} from "./iap-products";

describe("iap-products map", () => {
  it("maps the monthly product to coach/month", () => {
    expect(productForStoreId(IAP_COACH_MONTHLY)).toEqual({
      storeProductId: IAP_COACH_MONTHLY,
      tier: "coach",
      interval: "month",
    });
  });

  it("maps the annual product to coach/year", () => {
    expect(productForStoreId(IAP_COACH_ANNUAL)).toEqual({
      storeProductId: IAP_COACH_ANNUAL,
      tier: "coach",
      interval: "year",
    });
  });

  it("returns null for an unknown product id", () => {
    expect(productForStoreId("com.xogridmaker.app.unknown")).toBeNull();
  });

  it("round-trips tier+interval back to the store id", () => {
    expect(storeIdForTier("coach", "month")).toBe(IAP_COACH_MONTHLY);
    expect(storeIdForTier("coach", "year")).toBe(IAP_COACH_ANNUAL);
  });

  it("sells exactly one paid tier — no Coach Pro (coach_ai) product exists", () => {
    expect(storeIdForTier("coach_ai", "month")).toBeNull();
    expect(storeIdForTier("coach_ai", "year")).toBeNull();
    expect(IAP_PRODUCTS.every((p) => p.tier === "coach")).toBe(true);
  });
});
