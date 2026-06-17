import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

// Regression guard for the "stuck on Loading plans…" bug. On iOS, when StoreKit
// can't produce offers — it hung (→ timeout), errored, or returned zero products
// — the panel MUST land on a retryable error state, never spin on the loading
// view forever (a coach OR an App Store reviewer could get trapped). On non-iOS
// it shows the neutral fallback. IAP is always on now (the old enabled
// kill-switch was removed), so there is no "IAP disabled" branch to test.

const nativePlatform = vi.hoisted(() =>
  vi.fn((): "ios" | "android" | null => "ios"),
);
type Offer = { interval: "month" | "year"; productId: string; priceString: string };
const getCoachOffers = vi.hoisted(() =>
  vi.fn((): Promise<Offer[]> => Promise.resolve([])),
);
const restoreCoach = vi.hoisted(() =>
  vi.fn((): Promise<{ entitled: boolean }> => Promise.resolve({ entitled: false })),
);
const purchaseCoach = vi.hoisted(() =>
  vi.fn((): Promise<{ ok: boolean; entitled: boolean }> =>
    Promise.resolve({ ok: false, entitled: false }),
  ),
);

vi.mock("@/lib/native/isNativeApp", () => ({
  isNativeApp: () => nativePlatform() != null,
  nativePlatform,
}));
vi.mock("@/lib/native/iap", () => ({
  getCoachOffers,
  restoreCoach,
  purchaseCoach,
}));

import { NativeIapPanel } from "./NativeIapPanel";

const FALLBACK = <span>plans are not available in this app</span>;

async function renderPanel(node: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  // Flush the async load() chain (getCoachOffers → setState).
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  return {
    container,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  nativePlatform.mockReturnValue("ios");
  getCoachOffers.mockResolvedValue([]);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("NativeIapPanel", () => {
  it("shows StoreKit prices when offers load", async () => {
    getCoachOffers.mockResolvedValue([
      { interval: "month", productId: "com.xogridmaker.app.coach.monthly", priceString: "$9.99" },
      { interval: "year", productId: "com.xogridmaker.app.coach.annual", priceString: "$99.99" },
    ]);
    const { container, cleanup } = await renderPanel(<NativeIapPanel fallback={FALLBACK} />);

    expect(container.textContent).toContain("$9.99/mo");
    expect(container.textContent).toContain("$99.99/yr");
    expect(container.textContent).not.toContain("Loading plans");

    await cleanup();
  });

  it("lands on a retryable error state when StoreKit fails — never an infinite spinner", async () => {
    getCoachOffers.mockRejectedValue(
      new Error("StoreKit getProducts timed out after 12000ms"),
    );
    const { container, cleanup } = await renderPanel(<NativeIapPanel fallback={FALLBACK} />);

    expect(container.textContent).toContain("Try again");
    expect(container.textContent).not.toContain("Loading plans");

    await cleanup();
  });

  it("shows the retry state when StoreKit returns zero products", async () => {
    getCoachOffers.mockResolvedValue([]);
    const { container, cleanup } = await renderPanel(<NativeIapPanel fallback={FALLBACK} />);

    expect(container.textContent).toContain("Try again");

    await cleanup();
  });

  // Apple 3.1.2(c): the Terms of Use (EULA) + Privacy links must stay reachable
  // throughout the purchase flow — including when products fail to load. A
  // reviewer who hits the StoreKit load failure (the 2.1(b) rejection) lands on
  // the error card, and that card must still carry both legal links.
  it("keeps Terms of Use (EULA) + Privacy links in the error state (Apple 3.1.2(c))", async () => {
    getCoachOffers.mockResolvedValue([]); // 0 products → error phase
    const { container, cleanup } = await renderPanel(<NativeIapPanel fallback={FALLBACK} />);

    expect(container.textContent).toContain("Try again");
    expect(container.textContent).toContain("Terms of Use (EULA)");
    expect(container.textContent).toContain("Privacy Policy");

    await cleanup();
  });

  it("shows Terms of Use (EULA) + Privacy links alongside loaded offers", async () => {
    getCoachOffers.mockResolvedValue([
      { interval: "month", productId: "com.xogridmaker.app.coach.monthly", priceString: "$9.99" },
    ]);
    const { container, cleanup } = await renderPanel(<NativeIapPanel fallback={FALLBACK} />);

    expect(container.textContent).toContain("$9.99/mo");
    expect(container.textContent).toContain("Terms of Use (EULA)");
    expect(container.textContent).toContain("Privacy Policy");

    await cleanup();
  });

  it("shows the neutral fallback on non-iOS (Android) — never probes StoreKit", async () => {
    nativePlatform.mockReturnValue("android");
    const { container, cleanup } = await renderPanel(<NativeIapPanel fallback={FALLBACK} />);

    expect(container.textContent).toContain("not available in this app");
    expect(container.textContent).not.toContain("Try again");
    expect(getCoachOffers).not.toHaveBeenCalled();

    await cleanup();
  });
});
