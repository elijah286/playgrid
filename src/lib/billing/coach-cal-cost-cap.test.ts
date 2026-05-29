import { describe, expect, it } from "vitest";
import { computeRollingReset } from "./coach-cal-cost-cap";

const HOUR = 60 * 60 * 1000;

describe("computeRollingReset", () => {
  const now = Date.UTC(2026, 4, 29, 12, 0, 0); // fixed "now"
  const windowMs = 5 * HOUR;

  it("returns null when under the limit", () => {
    const rows = [{ occurredAtMs: now - HOUR, costMicros: 50_000 }];
    expect(computeRollingReset(rows, windowMs, 200_000, now)).toBeNull();
  });

  it("returns null when exactly at the limit (not over)", () => {
    const rows = [{ occurredAtMs: now - HOUR, costMicros: 200_000 }];
    // used == limit is not "over" for reset purposes (over = used - limit = 0)
    expect(computeRollingReset(rows, windowMs, 200_000, now)).toBeNull();
  });

  it("resets when the oldest spend ages out enough to dip under the limit", () => {
    // Two rows: oldest at now-4h ($0.15), newest at now-1h ($0.10).
    // used = $0.25, limit = $0.20, over = $0.05. Aging out the oldest
    // ($0.15 >= $0.05) brings us under. Reset = oldest.occurredAt + 5h.
    const oldest = now - 4 * HOUR;
    const rows = [
      { occurredAtMs: oldest, costMicros: 150_000 },
      { occurredAtMs: now - HOUR, costMicros: 100_000 },
    ];
    const reset = computeRollingReset(rows, windowMs, 200_000, now);
    expect(reset).toBe(new Date(oldest + windowMs).toISOString());
  });

  it("waits for multiple old rows when one isn't enough", () => {
    // Three small rows; need the two oldest to age out to get under.
    // each $0.08, limit $0.20, used $0.24, over $0.04. Oldest alone
    // ($0.08 >= $0.04) suffices → reset at oldest + window.
    const t0 = now - 4 * HOUR;
    const t1 = now - 3 * HOUR;
    const t2 = now - 2 * HOUR;
    const rows = [
      { occurredAtMs: t0, costMicros: 80_000 },
      { occurredAtMs: t1, costMicros: 80_000 },
      { occurredAtMs: t2, costMicros: 80_000 },
    ];
    expect(computeRollingReset(rows, windowMs, 200_000, now)).toBe(
      new Date(t0 + windowMs).toISOString(),
    );
  });

  it("ignores spend already outside the window", () => {
    // A big row 6h ago is outside the 5h window — shouldn't count.
    const rows = [
      { occurredAtMs: now - 6 * HOUR, costMicros: 500_000 },
      { occurredAtMs: now - HOUR, costMicros: 50_000 },
    ];
    expect(computeRollingReset(rows, windowMs, 200_000, now)).toBeNull();
  });

  it("needs the second-oldest row when the oldest alone is too small", () => {
    // oldest $0.01, next $0.10; used = $0.31, limit $0.20, over $0.11.
    // Aging out oldest ($0.01) → cumulative 0.01 < 0.11; need next too
    // (cumulative $0.11 >= $0.11) → reset at the SECOND row's time + window.
    const t0 = now - 4 * HOUR;
    const t1 = now - 3 * HOUR;
    const t2 = now - 2 * HOUR;
    const rows = [
      { occurredAtMs: t0, costMicros: 10_000 },
      { occurredAtMs: t1, costMicros: 100_000 },
      { occurredAtMs: t2, costMicros: 200_000 },
    ];
    expect(computeRollingReset(rows, windowMs, 200_000, now)).toBe(
      new Date(t1 + windowMs).toISOString(),
    );
  });
});
