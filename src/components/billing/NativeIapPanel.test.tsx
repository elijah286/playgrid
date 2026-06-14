import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

// Regression guard for the "stuck on Loading plans…" bug. When IAP is enabled
// but StoreKit can't produce offers — it hung (→ timeout), errored, or returned
// zero products — the panel MUST land on a retryable error state, never spin on
// the loading view forever (a coach OR an App Store reviewer could get trapped).
// And when IAP is off it must show the neutral fallback unchanged.

const nativePlatform = vi.hoisted(() =>
  vi.fn((): "ios" | "android" | null => "ios"),
);
const getIapClientConfig = vi.hoisted(() =>
  vi.fn((): Promise<{ enabled: boolean }> => Promise.resolve({ enabled: true })),
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
vi.mock("@/app/actions/iap", () => ({ getIapClientConfig }));
vi.mock("@/lib/native/iap", () => ({ getCoachOffers, restoreCoach, purchaseCoach }));

import { NativeIapPanel } from "./NativeIapPanel";

const FALLBACK = <span>plans are not available in this app</span>;

async function renderPanel(node: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  // Flush the async load() chain (getIapClientConfig → getCoachOffers → setState).
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
  getIapClientConfig.mockResolvedValue({ enabled: true });
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

  it("shows the neutral fallback when IAP is disabled (pre-launch)", async () => {
    getIapClientConfig.mockResolvedValue({ enabled: false });
    const { container, cleanup } = await renderPanel(<NativeIapPanel fallback={FALLBACK} />);

    expect(container.textContent).toContain("not available in this app");
    expect(container.textContent).not.toContain("Try again");

    await cleanup();
  });
});
