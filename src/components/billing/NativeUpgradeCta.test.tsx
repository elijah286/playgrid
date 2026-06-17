import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

// NativeUpgradeCta is the ONLY door to the in-app purchase screen on iOS. IAP is
// always on now (the enabled kill-switch was removed), so the contract is two
// states:
//   (a) web → render nothing (web keeps its own data-web-only CTAs),
//   (b) iOS → link to /pricing (the StoreKit purchase panel).
// The legacy `fallback` prop (shown pre-launch when IAP was off) is retained for
// call-site compatibility but must never render.

const nativePlatform = vi.hoisted(() =>
  vi.fn((): "ios" | "android" | null => null),
);

vi.mock("@/lib/native/isNativeApp", () => ({
  isNativeApp: () => nativePlatform() != null,
  nativePlatform,
}));
// Render Link as a plain anchor so the test exercises our gating, not Next's
// router runtime (which isn't present under vitest/jsdom).
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: unknown;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children as never}
    </a>
  ),
}));

import { NativeUpgradeCta, useUpgradeHref } from "./NativeUpgradeCta";

async function renderCta(node: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  // Flush the platform-resolving effect and the setState it triggers.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
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
  nativePlatform.mockReturnValue(null);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("NativeUpgradeCta", () => {
  it("renders nothing on web", async () => {
    nativePlatform.mockReturnValue(null);
    const { container, cleanup } = await renderCta(<NativeUpgradeCta />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("");

    await cleanup();
  });

  it("links to /pricing on iOS", async () => {
    nativePlatform.mockReturnValue("ios");
    const { container, cleanup } = await renderCta(
      <NativeUpgradeCta label="Subscribe to Coach" />,
    );

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/pricing");
    expect(link?.textContent).toContain("Subscribe to Coach");

    await cleanup();
  });

  it("never renders the (deprecated) fallback on iOS — always the live door", async () => {
    nativePlatform.mockReturnValue("ios");
    const { container, cleanup } = await renderCta(
      <NativeUpgradeCta fallback={<span>not available in this app</span>} />,
    );

    expect(container.querySelector("a")?.getAttribute("href")).toBe("/pricing");
    expect(container.textContent).not.toMatch(/not available in this app/i);

    await cleanup();
  });

  it("applies a className override to the link", async () => {
    nativePlatform.mockReturnValue("ios");
    const { container, cleanup } = await renderCta(
      <NativeUpgradeCta label="Up" className="custom-cta-class" />,
    );

    expect(container.querySelector("a")?.className).toContain("custom-cta-class");

    await cleanup();
  });
});

// The whole-tile tap target (locked playbooks/plays) wires this href onto a
// wrapping Link: linkable on web + iOS (IAP is always on).
function HrefProbe() {
  const href = useUpgradeHref();
  return <span>{href ?? "null"}</span>;
}

describe("useUpgradeHref", () => {
  it("returns /pricing on web", async () => {
    nativePlatform.mockReturnValue(null);
    const { container, cleanup } = await renderCta(<HrefProbe />);
    expect(container.textContent).toBe("/pricing");
    await cleanup();
  });

  it("returns /pricing on iOS", async () => {
    nativePlatform.mockReturnValue("ios");
    const { container, cleanup } = await renderCta(<HrefProbe />);
    expect(container.textContent).toBe("/pricing");
    await cleanup();
  });
});
