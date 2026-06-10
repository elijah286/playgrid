import { describe, it, expect, vi, beforeEach } from "vitest";
import { NATIVE_APP_UA_MARKER } from "@/lib/native/nativeRequest";

// Regression guard for App Store Guideline 5.1.2(i): inside the native app
// shell, the conversion pixels and the cookie-consent banner must not render
// AT ALL — and the gate must run BEFORE any tracking setup (pixel-id reads,
// geo lookup, consent-cookie reads). We mock those dependencies to throw, so a
// test fails loudly if the gate is ever moved below them.

const NATIVE_UA = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 ${NATIVE_APP_UA_MARKER}`;

let currentUa: string | null = NATIVE_UA;

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k === "user-agent" ? currentUa : null) }),
  cookies: async () => {
    throw new Error("cookies() should not be reached on the native path");
  },
}));

vi.mock("@/lib/site/meta-pixel-config", () => ({
  getStoredMetaPixelId: vi.fn(async () => {
    throw new Error("getStoredMetaPixelId should not be called inside the native app");
  }),
}));

vi.mock("@/lib/site/reddit-pixel-config", () => ({
  getStoredRedditPixelId: vi.fn(async () => {
    throw new Error("getStoredRedditPixelId should not be called inside the native app");
  }),
}));

vi.mock("@/lib/geo/maxmind", () => ({
  lookupGeo: vi.fn(async () => {
    throw new Error("lookupGeo should not be called inside the native app");
  }),
}));

vi.mock("@/lib/attribution/consent", () => ({
  readConsentCookie: vi.fn(async () => {
    throw new Error("readConsentCookie should not be called inside the native app");
  }),
  shouldSuppressTracking: vi.fn(() => {
    throw new Error("shouldSuppressTracking should not be called inside the native app");
  }),
}));

import MetaPixel from "./MetaPixel";
import RedditPixel from "./RedditPixel";
import ConsentGate from "./ConsentGate";

beforeEach(() => {
  currentUa = NATIVE_UA;
});

describe("tracking surfaces inside the native app shell", () => {
  it("MetaPixel renders nothing and never reads its pixel id", async () => {
    expect(await MetaPixel()).toBeNull();
  });

  it("RedditPixel renders nothing and never reads its pixel id", async () => {
    expect(await RedditPixel()).toBeNull();
  });

  it("ConsentGate renders no cookie banner and never reads consent/geo", async () => {
    expect(await ConsentGate()).toBeNull();
  });

  it("the gate keys off the User-Agent marker (no marker → would proceed)", async () => {
    // Without the marker, the gate falls through to the mocked dependencies,
    // which throw — proving the only thing suppressing tracking is the marker.
    currentUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
    await expect(MetaPixel()).rejects.toThrow(/getStoredMetaPixelId/);
  });
});
