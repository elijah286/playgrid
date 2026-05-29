import { describe, it, expect } from "vitest";
import {
  buildAppOpenWrite,
  clipStr,
  isAppPlatform,
  type AppOpenContext,
} from "./app-open";

const baseCtx: AppOpenContext = {
  installId: "install-1",
  platform: "android",
  userId: null,
  appVersion: "1.2.3",
  installReferrer: null,
  now: "2026-05-29T12:00:00.000Z",
};

describe("buildAppOpenWrite", () => {
  it("first open (no existing row) inserts with first_opened_at = now (the install)", () => {
    const w = buildAppOpenWrite(null, baseCtx);
    expect(w.action).toBe("insert");
    if (w.action !== "insert") throw new Error("expected insert");
    expect(w.row).toMatchObject({
      install_id: "install-1",
      platform: "android",
      app_version: "1.2.3",
      first_opened_at: baseCtx.now,
      last_opened_at: baseCtx.now,
      user_id: null,
    });
  });

  it("first open with a known user attaches user_id", () => {
    const w = buildAppOpenWrite(null, { ...baseCtx, userId: "user-9" });
    if (w.action !== "insert") throw new Error("expected insert");
    expect(w.row.user_id).toBe("user-9");
  });

  it("repeat open updates last_opened_at and never touches first_opened_at", () => {
    const existing = { install_id: "install-1", user_id: null, install_referrer: null };
    const w = buildAppOpenWrite(existing, { ...baseCtx, now: "2026-06-01T00:00:00.000Z" });
    expect(w.action).toBe("update");
    if (w.action !== "update") throw new Error("expected update");
    expect(w.patch.last_opened_at).toBe("2026-06-01T00:00:00.000Z");
    expect("first_opened_at" in w.patch).toBe(false);
  });

  it("repeat open attaches user_id when newly known", () => {
    const existing = { install_id: "install-1", user_id: null, install_referrer: null };
    const w = buildAppOpenWrite(existing, { ...baseCtx, userId: "user-9" });
    if (w.action !== "update") throw new Error("expected update");
    expect(w.patch.user_id).toBe("user-9");
  });

  it("repeat open NEVER clears an existing user_id back to null (anonymous open)", () => {
    const existing = { install_id: "install-1", user_id: "user-9", install_referrer: null };
    const w = buildAppOpenWrite(existing, { ...baseCtx, userId: null });
    if (w.action !== "update") throw new Error("expected update");
    expect("user_id" in w.patch).toBe(false); // omitted → not overwritten
  });

  it("captures install_referrer once and never overwrites an existing one", () => {
    const fresh = { install_id: "install-1", user_id: "u", install_referrer: null };
    const w1 = buildAppOpenWrite(fresh, { ...baseCtx, installReferrer: "utm_source=web_banner" });
    if (w1.action !== "update") throw new Error("expected update");
    expect(w1.patch.install_referrer).toBe("utm_source=web_banner");

    const already = { install_id: "install-1", user_id: "u", install_referrer: "first-ref" };
    const w2 = buildAppOpenWrite(already, { ...baseCtx, installReferrer: "second-ref" });
    if (w2.action !== "update") throw new Error("expected update");
    expect("install_referrer" in w2.patch).toBe(false); // preserved
  });
});

describe("clipStr / isAppPlatform", () => {
  it("clipStr trims, caps length, and nulls empties", () => {
    expect(clipStr("  hi  ", 10)).toBe("hi");
    expect(clipStr("abcdef", 3)).toBe("abc");
    expect(clipStr("   ", 10)).toBeNull();
    expect(clipStr(null, 10)).toBeNull();
    expect(clipStr(undefined, 10)).toBeNull();
  });

  it("isAppPlatform accepts only android/ios", () => {
    expect(isAppPlatform("android")).toBe(true);
    expect(isAppPlatform("ios")).toBe(true);
    expect(isAppPlatform("web")).toBe(false);
    expect(isAppPlatform(null)).toBe(false);
    expect(isAppPlatform("")).toBe(false);
  });
});
