import { describe, it, expect } from "vitest";
import { summarizeAppInstalls, normalizeAppPlatform } from "./app-metrics";

const NOW = Date.parse("2026-06-22T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("normalizeAppPlatform", () => {
  it("maps ios/android case-insensitively and buckets the rest as other", () => {
    expect(normalizeAppPlatform("ios")).toBe("ios");
    expect(normalizeAppPlatform("iOS")).toBe("ios");
    expect(normalizeAppPlatform("android")).toBe("android");
    expect(normalizeAppPlatform("web")).toBe("other");
    expect(normalizeAppPlatform(null)).toBe("other");
  });
});

describe("summarizeAppInstalls", () => {
  const excluded = new Set<string>(["staff-1", "reviewer-1"]);

  it("excludes internal accounts, separates anonymous opens, and counts real installs by platform", () => {
    const rows = [
      { platform: "ios", user_id: "real-1", first_opened_at: daysAgo(10), last_opened_at: daysAgo(1) }, // real, active
      { platform: "ios", user_id: "real-2", first_opened_at: daysAgo(20), last_opened_at: daysAgo(14) }, // real, inactive
      { platform: "android", user_id: "real-3", first_opened_at: daysAgo(3), last_opened_at: daysAgo(2) }, // real, active
      { platform: "ios", user_id: "staff-1", first_opened_at: daysAgo(5), last_opened_at: daysAgo(0) }, // internal
      { platform: "ios", user_id: "reviewer-1", first_opened_at: daysAgo(5), last_opened_at: daysAgo(0) }, // internal
      { platform: "ios", user_id: null, first_opened_at: daysAgo(2), last_opened_at: daysAgo(2) }, // anonymous
      { platform: "ios", user_id: null, first_opened_at: daysAgo(1), last_opened_at: daysAgo(1) }, // anonymous
    ];
    const s = summarizeAppInstalls(rows, excluded, { nowMs: NOW, activeWindowDays: 7 });

    expect(s.excludedInternal).toBe(2);
    expect(s.anonymousOpens).toBe(2);
    expect(s.real.installs).toBe(3);
    expect(s.real.active).toBe(2); // real-1 (1d) + real-3 (2d); real-2 is 14d out

    const ios = s.real.byPlatform.find((p) => p.platform === "ios")!;
    const android = s.real.byPlatform.find((p) => p.platform === "android")!;
    expect(ios.installs).toBe(2); // real-1 + real-2
    expect(ios.active).toBe(1); // only real-1 within 7d (real-2 is 14d out)
    expect(android.installs).toBe(1);
    expect(android.active).toBe(1);
  });

  it("regression: the pre-launch TestFlight/review/dev pattern is NOT counted as real users", () => {
    // This is the exact shape that made a pre-release build read as healthy:
    // the founder's device + reviewer@ + an anonymous open, with one real user.
    const rows = [
      { platform: "ios", user_id: "staff-1", first_opened_at: daysAgo(18), last_opened_at: daysAgo(0) },
      { platform: "ios", user_id: "reviewer-1", first_opened_at: daysAgo(11), last_opened_at: daysAgo(2) },
      { platform: "ios", user_id: null, first_opened_at: daysAgo(4), last_opened_at: daysAgo(4) },
      { platform: "ios", user_id: "real-1", first_opened_at: daysAgo(1), last_opened_at: daysAgo(1) },
    ];
    const s = summarizeAppInstalls(rows, excluded, { nowMs: NOW, activeWindowDays: 7 });

    expect(s.real.installs).toBe(1);
    expect(s.real.active).toBe(1);
    expect(s.excludedInternal).toBe(2);
    expect(s.anonymousOpens).toBe(1);
  });

  it("handles an empty table without dividing by zero", () => {
    const s = summarizeAppInstalls([], excluded, { nowMs: NOW });
    expect(s.real.installs).toBe(0);
    expect(s.real.active).toBe(0);
    expect(s.anonymousOpens).toBe(0);
    expect(s.activeWindowDays).toBe(7);
  });
});
