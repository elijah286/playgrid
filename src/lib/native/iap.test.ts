import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the IAP-load bug that caused Apple Guideline 2.1(b)
// ("unable to load in-app purchase"). `plugin()` returned the @capgo/native-
// purchases PROXY bare from an async function. A Capacitor plugin proxy forwards
// EVERY property access — including `.then` — to a native method call, so the
// async function's implicit `Promise.resolve(proxy)` treated the proxy as a
// thenable and invoked `NativePurchases.then()` natively →
// "NativePurchases.then() is not implemented on ios", rejecting before
// getProducts ever ran. The fix nests the proxy under a key so it is never
// assimilated. This test reproduces the proxy's `.then`-forwarding and asserts
// the load path survives it.

const isNativeApp = vi.hoisted(() => vi.fn(() => true));
const nativePlatform = vi.hoisted(() => vi.fn((): "ios" | "android" | "web" => "ios"));

const getProductsMock = vi.hoisted(() =>
  vi.fn(async () => ({
    products: [
      { identifier: "com.xogridmaker.app.coach.monthly", priceString: "$9.99" },
      { identifier: "com.xogridmaker.app.coach.annual", priceString: "$99.99" },
    ],
  })),
);

// Mimics @capacitor/core's plugin proxy: any property access returns a function
// that calls a native method. For methods that don't exist natively — INCLUDING
// `then` — that call throws "not implemented on ios". If our code awaits the
// bare proxy, Promise assimilation calls this for `then` and the chain rejects.
const nativePurchasesProxy = vi.hoisted(
  () =>
    new Proxy({} as Record<string, unknown>, {
      get(_t, prop: string | symbol) {
        if (prop === "getProducts") return getProductsMock;
        return () => {
          throw new Error(`"NativePurchases.${String(prop)}()" is not implemented on ios`);
        };
      },
    }),
);

vi.mock("@/lib/native/isNativeApp", () => ({ isNativeApp, nativePlatform }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@capgo/native-purchases", () => ({ NativePurchases: nativePurchasesProxy }));

import { getCoachOffers } from "./iap";

beforeEach(() => {
  vi.useFakeTimers(); // the 12s StoreKit timeout must not fire during the test
  isNativeApp.mockReturnValue(true);
  nativePlatform.mockReturnValue("ios");
  getProductsMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("getCoachOffers — Capacitor proxy thenable regression (Apple 2.1(b))", () => {
  it("reaches getProducts and returns offers instead of rejecting on NativePurchases.then()", async () => {
    const offers = await getCoachOffers();

    // With the bug, this would reject before getProducts ran; the fix gets here.
    expect(getProductsMock).toHaveBeenCalledTimes(1);
    expect(offers).toEqual([
      {
        interval: "month",
        productId: "com.xogridmaker.app.coach.monthly",
        priceString: "$9.99",
      },
      {
        interval: "year",
        productId: "com.xogridmaker.app.coach.annual",
        priceString: "$99.99",
      },
    ]);
  });
});
