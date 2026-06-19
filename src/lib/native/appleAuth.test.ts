import { describe, expect, it } from "vitest";
import { appleDisplayName, randomNonce, sha256Hex } from "./appleAuth";

describe("appleDisplayName", () => {
  it("joins given and family name", () => {
    expect(appleDisplayName({ givenName: "Coach", familyName: "Smith" })).toBe(
      "Coach Smith",
    );
  });

  it("handles a single name component", () => {
    expect(appleDisplayName({ givenName: "Coach", familyName: null })).toBe("Coach");
    expect(appleDisplayName({ givenName: null, familyName: "Smith" })).toBe("Smith");
  });

  it("trims whitespace around components", () => {
    expect(appleDisplayName({ givenName: "  Coach ", familyName: " Smith " })).toBe(
      "Coach Smith",
    );
  });

  it("returns null when nothing usable is present", () => {
    expect(appleDisplayName(null)).toBeNull();
    expect(appleDisplayName(undefined)).toBeNull();
    expect(appleDisplayName({ givenName: null, familyName: null })).toBeNull();
    expect(appleDisplayName({ givenName: "  ", familyName: "" })).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector for the empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the known SHA-256 vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and lowercase-hex of length 64", async () => {
    const a = await sha256Hex("xo-gridmaker");
    const b = await sha256Hex("xo-gridmaker");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different digests for different inputs", async () => {
    expect(await sha256Hex("nonce-1")).not.toBe(await sha256Hex("nonce-2"));
  });
});

describe("randomNonce", () => {
  it("defaults to length 32 and respects a custom length", () => {
    expect(randomNonce()).toHaveLength(32);
    expect(randomNonce(16)).toHaveLength(16);
    expect(randomNonce(64)).toHaveLength(64);
  });

  it("only emits URL-safe characters", () => {
    expect(randomNonce(256)).toMatch(/^[0-9A-Za-z._-]+$/);
  });

  it("is effectively unique across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(randomNonce());
    expect(seen.size).toBe(1000);
  });

  // The whole reason this module exists: Apple gets the HASH, Supabase gets
  // the RAW value. This asserts the two are different (i.e. we never
  // accidentally send the same string to both, which would fail Supabase's
  // nonce check or defeat replay protection).
  it("hash of the nonce differs from the raw nonce", async () => {
    const raw = randomNonce();
    expect(await sha256Hex(raw)).not.toBe(raw);
  });
});
