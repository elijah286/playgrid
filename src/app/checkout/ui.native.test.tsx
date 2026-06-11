import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

// Regression guard for App Store Guideline 3.1.1 / 3.1.3(b): the native iOS
// app must expose NO in-app purchase. Stripe Embedded Checkout is a non-IAP
// payment mechanism, so CheckoutClient must refuse to create a checkout
// session inside the native shell — the backstop that holds even if some
// upgrade CTA leaks past its data-web-only gate. This reproduces the leak
// that got build 1.0 (2) rejected (ungated "Upgrade to Team Coach" → /checkout).

const createSession = vi.hoisted(() =>
  vi.fn(async (_opts: { tier: string; interval: string }) => ({
    ok: true as const,
    clientSecret: "cs_test_123",
    publishableKey: "pk_test_123",
  })),
);

vi.mock("@/lib/native/isNativeApp", () => ({
  isNativeApp: () => true,
  nativePlatform: () => "ios",
}));
vi.mock("@/lib/native/useIsNativeApp", () => ({
  useIsNativeApp: () => true,
  useNativePlatform: () => "ios",
}));
vi.mock("@/app/actions/billing", () => ({
  createEmbeddedCheckoutSessionAction: createSession,
}));
// Mock Stripe so importing the component never touches the real SDK.
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn(async () => null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({ children }: { children?: ReactNode }) => children,
  EmbeddedCheckout: () => null,
}));

import { CheckoutClient } from "./ui";

afterEach(() => createSession.mockClear());

describe("CheckoutClient native backstop (App Store 3.1.1)", () => {
  it("never creates a Stripe session, and shows a no-purchase notice, in the native app", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CheckoutClient tier="coach" interval="month" />);
    });

    // The non-IAP purchase path must NOT fire on native.
    expect(createSession).not.toHaveBeenCalled();
    // And the user sees a neutral notice — no price, no purchase button.
    expect(container.textContent ?? "").toMatch(/aren.t available in the app/i);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
