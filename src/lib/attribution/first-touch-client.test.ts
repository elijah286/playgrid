import { afterEach, describe, expect, it } from "vitest";
import { FIRST_TOUCH_COOKIE } from "./first-touch";
import {
  readFirstTouchCookieClient,
  setFirstTouchCookieClientIfMissing,
} from "./first-touch-client";

function clearCookie() {
  document.cookie = `${FIRST_TOUCH_COOKIE}=; path=/; max-age=0`;
}

const EMPTY_FIELDS = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  referrer: null,
  landing_path: null,
  country: null,
  region: null,
  city: null,
};

describe("first-touch-client", () => {
  afterEach(() => {
    clearCookie();
  });

  it("writes the cookie when none exists and at least one field is meaningful", () => {
    setFirstTouchCookieClientIfMissing({
      ...EMPTY_FIELDS,
      landing_path: "/",
    });
    const payload = readFirstTouchCookieClient();
    expect(payload).toBeTruthy();
    expect(payload?.landing_path).toBe("/");
    expect(payload?.ts).toBeTruthy();
  });

  it("does not overwrite an existing cookie", () => {
    setFirstTouchCookieClientIfMissing({
      ...EMPTY_FIELDS,
      landing_path: "/original",
    });
    setFirstTouchCookieClientIfMissing({
      ...EMPTY_FIELDS,
      landing_path: "/replacement",
    });
    expect(readFirstTouchCookieClient()?.landing_path).toBe("/original");
  });

  it("skips writing when every field is null/empty", () => {
    setFirstTouchCookieClientIfMissing({ ...EMPTY_FIELDS });
    expect(readFirstTouchCookieClient()).toBeNull();
  });

  it("preserves UTM + click ids in the payload", () => {
    setFirstTouchCookieClientIfMissing({
      ...EMPTY_FIELDS,
      utm_source: "reddit",
      utm_medium: "cpc",
      utm_campaign: "football-launch",
      landing_path: "/",
      gclid: "abc123",
    });
    const payload = readFirstTouchCookieClient();
    expect(payload?.utm_source).toBe("reddit");
    expect(payload?.utm_medium).toBe("cpc");
    expect(payload?.utm_campaign).toBe("football-launch");
    expect(payload?.gclid).toBe("abc123");
  });

  it("returns null when the cookie payload is malformed", () => {
    document.cookie = `${FIRST_TOUCH_COOKIE}=not-json; path=/`;
    expect(readFirstTouchCookieClient()).toBeNull();
  });
});
