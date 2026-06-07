/**
 * Churned ex-payer detection for the admin users list.
 *
 * The live user_entitlements view only shows *active* subscriptions, so a coach
 * who paid and cancelled drops back to "Free" with no trace. buildFormerSubscriptionMap
 * recovers that history from the raw subscriptions table so the admin list can
 * flag them. (Surfaced 2026-06-06 — "Billy cancelled, can we denote that?")
 */

import { describe, expect, it } from "vitest";
import {
  buildFormerSubscriptionMap,
  isTerminalSubscriptionStatus,
  type FormerSubscriptionRow,
} from "./former-subscription";

function row(over: Partial<FormerSubscriptionRow>): FormerSubscriptionRow {
  return {
    user_id: "u1",
    tier: "coach",
    status: "canceled",
    current_period_end: "2026-06-02T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
    stripe_cancellation_feedback: null,
    ...over,
  };
}

describe("isTerminalSubscriptionStatus", () => {
  it("treats canceled / unpaid / incomplete_expired as terminal", () => {
    expect(isTerminalSubscriptionStatus("canceled")).toBe(true);
    expect(isTerminalSubscriptionStatus("unpaid")).toBe(true);
    expect(isTerminalSubscriptionStatus("incomplete_expired")).toBe(true);
  });

  it("treats active / trialing / past_due as NOT terminal", () => {
    expect(isTerminalSubscriptionStatus("active")).toBe(false);
    expect(isTerminalSubscriptionStatus("trialing")).toBe(false);
    expect(isTerminalSubscriptionStatus("past_due")).toBe(false);
    expect(isTerminalSubscriptionStatus(null)).toBe(false);
  });
});

describe("buildFormerSubscriptionMap", () => {
  it("captures a lapsed subscription with tier, end date, and reason", () => {
    const map = buildFormerSubscriptionMap([
      row({ tier: "coach", stripe_cancellation_feedback: "too_expensive" }),
    ]);
    const f = map.get("u1");
    expect(f).toBeTruthy();
    expect(f?.tier).toBe("coach");
    expect(f?.status).toBe("canceled");
    expect(f?.endedAt).toBe("2026-06-02T00:00:00Z");
    expect(f?.reason).toBe("too_expensive");
  });

  it("ignores active/current subscriptions", () => {
    const map = buildFormerSubscriptionMap([
      row({ status: "active" }),
      row({ status: "trialing" }),
      row({ status: "past_due" }),
    ]);
    expect(map.size).toBe(0);
  });

  it("keeps the most-recently-ended lapsed subscription when several exist", () => {
    const map = buildFormerSubscriptionMap([
      row({ tier: "coach", current_period_end: "2026-01-01T00:00:00Z" }),
      row({ tier: "coach_ai", current_period_end: "2026-06-02T00:00:00Z" }),
    ]);
    expect(map.get("u1")?.tier).toBe("coach_ai");
    expect(map.get("u1")?.endedAt).toBe("2026-06-02T00:00:00Z");
  });

  it("falls back to updated_at when current_period_end is missing", () => {
    const map = buildFormerSubscriptionMap([
      row({ current_period_end: null, updated_at: "2026-05-09T00:00:00Z" }),
    ]);
    expect(map.get("u1")?.endedAt).toBe("2026-05-09T00:00:00Z");
  });

  it("keys by user and skips rows without a user_id", () => {
    const map = buildFormerSubscriptionMap([
      row({ user_id: "a" }),
      row({ user_id: "b", tier: "coach_ai" }),
      row({ user_id: null }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get("a")?.tier).toBe("coach");
    expect(map.get("b")?.tier).toBe("coach_ai");
  });
});
