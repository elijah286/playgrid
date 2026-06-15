/**
 * Regression: the FCM (Android) and APNs (iOS) transports must be independent.
 * Before this, they ran sequentially (FCM → APNs) with no timeout on the FCM
 * fetch, so a failing/stalled FCM send could starve the iOS push entirely — the
 * exact shape of an intermittent "admin signup didn't notify my iPhone" miss.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// APNs path is stubbed so the test never touches Apple; it always "delivers 1".
vi.mock("@/lib/notifications/apns", () => ({
  sendApnsToTokens: vi.fn(async () => ({ delivered: 1, deadTokenIds: [] })),
  PROD_HOST: "api.push.apple.com",
  SANDBOX_HOST: "api.development.push.apple.com",
}));
vi.mock("@/lib/site/apns-config", () => ({
  loadApnsConfig: vi.fn(async () => ({
    keyId: "K",
    teamId: "T",
    bundleId: "com.x",
    privateKey: "p",
    primaryHost: "api.push.apple.com",
  })),
}));

import { sendPushToUsers, __resetPushTokenCacheForTests } from "./push";
import { sendApnsToTokens } from "@/lib/notifications/apns";

function makeAdmin() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      in: () => builder,
      update: () => builder,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => void) => {
        const data =
          table === "device_tokens"
            ? [
                { id: "i1", token: "ios-tok", platform: "ios" },
                { id: "a1", token: "and-tok", platform: "android" },
              ]
            : [];
        resolve({ data, error: null });
      },
    };
    return builder;
  };
  return { from } as unknown as Parameters<typeof sendPushToUsers>[0]["admin"];
}

let privateKey: string;
beforeEach(() => {
  __resetPushTokenCacheForTests();
  ({ privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }));
  process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "fcm@example.iam.gserviceaccount.com",
    private_key: privateKey,
    project_id: "test-project",
  });
});
afterEach(() => {
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("transport isolation", () => {
  it("still delivers via APNs when FCM fails, and sends FCM with a timeout signal", async () => {
    let fcmSignal: unknown = "MISSING";
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "ya29", expires_in: 3600 }), { status: 200 });
      }
      // FCM send: record that a timeout AbortSignal was wired, then fail hard.
      fcmSignal = init?.signal;
      throw new Error("FCM unreachable");
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const res = await sendPushToUsers({
      admin: makeAdmin(),
      userIds: ["u1"],
      category: "admin_ops",
      message: { title: "New sign-up", body: "Someone signed up" },
    });

    // APNs delivered despite FCM throwing — transports are independent.
    expect(sendApnsToTokens).toHaveBeenCalledTimes(1);
    expect(res.delivered).toBe(1);
    expect(res.configured).toBe(true);
    // The FCM fetch carried an abort signal (the 10s timeout guard).
    expect(fcmSignal).toBeInstanceOf(AbortSignal);
  });
});
