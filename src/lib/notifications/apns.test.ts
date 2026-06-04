import { generateKeyPairSync, verify as cryptoVerify } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetApnsJwtCacheForTests,
  buildApnsPayload,
  classifyApnsResponse,
  mintApnsJwt,
} from "./apns";

function b64urlToJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

// A throwaway EC P-256 key — same curve Apple's APNs auth keys use.
function testKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey,
  };
}

describe("mintApnsJwt", () => {
  afterEach(() => __resetApnsJwtCacheForTests());

  it("produces a 3-part ES256 JWT with the right header + claims", () => {
    const { pem } = testKey();
    const jwt = mintApnsJwt(
      { keyId: "ABC1234567", teamId: "X8KHNQJC32", privateKey: pem },
      1_700_000_000,
    );
    const [header, claims, sig] = jwt.split(".");
    expect(sig).toBeTruthy();
    expect(b64urlToJson(header)).toEqual({ alg: "ES256", kid: "ABC1234567" });
    expect(b64urlToJson(claims)).toEqual({
      iss: "X8KHNQJC32",
      iat: 1_700_000_000,
    });
  });

  it("signs with the EC key so APNs can verify it (raw r||s / ES256)", () => {
    const { pem, publicKey } = testKey();
    const jwt = mintApnsJwt(
      { keyId: "K", teamId: "T", privateKey: pem },
      1_700_000_000,
    );
    const [header, claims, sig] = jwt.split(".");
    const ok = cryptoVerify(
      "SHA256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(sig, "base64url"),
    );
    expect(ok).toBe(true);
  });

  it("reuses the cached token within the refresh window, remints after", () => {
    const { pem } = testKey();
    const cfg = { keyId: "K", teamId: "T", privateKey: pem };
    const a = mintApnsJwt(cfg, 1_700_000_000);
    const b = mintApnsJwt(cfg, 1_700_000_000 + 10 * 60); // 10 min later
    expect(b).toBe(a); // cached
    const c = mintApnsJwt(cfg, 1_700_000_000 + 55 * 60); // past 50-min refresh
    expect(c).not.toBe(a); // reminted
  });
});

describe("buildApnsPayload", () => {
  it("builds the aps alert with sound", () => {
    const payload = JSON.parse(
      buildApnsPayload({ title: "Practice", body: "5pm today" }),
    );
    expect(payload.aps).toEqual({
      alert: { title: "Practice", body: "5pm today" },
      sound: "default",
    });
  });

  it("puts link at the top level and merges data keys", () => {
    const payload = JSON.parse(
      buildApnsPayload({
        title: "T",
        body: "B",
        link: "/playbooks/123?tab=calendar",
        data: { eventId: "e1" },
      }),
    );
    expect(payload.link).toBe("/playbooks/123?tab=calendar");
    expect(payload.eventId).toBe("e1");
  });
});

describe("classifyApnsResponse", () => {
  it("200 → ok", () => {
    expect(classifyApnsResponse(200, "", false)).toEqual({ ok: true });
  });

  it("410 Unregistered → dead", () => {
    expect(classifyApnsResponse(410, "Unregistered", false)).toEqual({
      ok: false,
      dead: true,
      retrySandbox: false,
    });
  });

  it("BadDeviceToken on prod → retry sandbox, not yet dead", () => {
    expect(classifyApnsResponse(400, "BadDeviceToken", false)).toEqual({
      ok: false,
      dead: false,
      retrySandbox: true,
    });
  });

  it("BadDeviceToken after sandbox retry → dead", () => {
    expect(classifyApnsResponse(400, "BadDeviceToken", true)).toEqual({
      ok: false,
      dead: true,
      retrySandbox: false,
    });
  });

  it("DeviceTokenNotForTopic → dead", () => {
    expect(classifyApnsResponse(400, "DeviceTokenNotForTopic", false)).toEqual({
      ok: false,
      dead: true,
      retrySandbox: false,
    });
  });

  it("transient reasons (e.g. TooManyRequests) → not dead, no retry", () => {
    expect(classifyApnsResponse(429, "TooManyRequests", false)).toEqual({
      ok: false,
      dead: false,
      retrySandbox: false,
    });
  });
});
