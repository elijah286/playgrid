import { describe, it, expect } from "vitest";
import {
  buildPayerStatusMap,
  type PayerSubscriptionRow,
} from "./payer-status";

/**
 * Payer status badges for the revenue dashboard. The dashboard must distinguish
 * "still paying" from "set to cancel" from "already cancelled", and pick the
 * right row when a user has churned and re-subscribed.
 */

function row(p: Partial<PayerSubscriptionRow>): PayerSubscriptionRow {
  return {
    user_id: "u1",
    tier: "coach",
    status: "active",
    current_period_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    billing_interval: "month",
    updated_at: null,
    ...p,
  };
}

describe("buildPayerStatusMap", () => {
  it("badges a plain active subscription as active", () => {
    const m = buildPayerStatusMap([row({ status: "active" })]);
    expect(m.get("u1")?.badge).toBe("active");
  });

  it("badges an active sub set to cancel as canceling, keeping the end date", () => {
    const m = buildPayerStatusMap([
      row({
        status: "active",
        cancel_at_period_end: true,
        current_period_end: "2026-09-01T00:00:00Z",
      }),
    ]);
    const s = m.get("u1");
    expect(s?.badge).toBe("canceling");
    expect(s?.currentPeriodEnd).toBe("2026-09-01T00:00:00Z");
  });

  it("badges a terminal subscription as cancelled with an ended date", () => {
    const m = buildPayerStatusMap([
      row({
        status: "canceled",
        current_period_end: "2026-03-01T00:00:00Z",
      }),
    ]);
    const s = m.get("u1");
    expect(s?.badge).toBe("cancelled");
    expect(s?.endedAt).toBe("2026-03-01T00:00:00Z");
  });

  it("badges trialing and past_due distinctly", () => {
    expect(
      buildPayerStatusMap([row({ status: "trialing" })]).get("u1")?.badge,
    ).toBe("trialing");
    expect(
      buildPayerStatusMap([row({ status: "past_due" })]).get("u1")?.badge,
    ).toBe("past_due");
  });

  it("prefers an active row over a terminal one for a re-subscriber", () => {
    const m = buildPayerStatusMap([
      row({
        status: "canceled",
        current_period_end: "2026-01-01T00:00:00Z",
      }),
      row({
        status: "active",
        current_period_end: "2026-12-01T00:00:00Z",
      }),
    ]);
    expect(m.get("u1")?.badge).toBe("active");
  });

  it("keeps the latest-ending row among multiple terminal subscriptions", () => {
    const m = buildPayerStatusMap([
      row({ status: "canceled", current_period_end: "2025-06-01T00:00:00Z", tier: "coach" }),
      row({ status: "canceled", current_period_end: "2026-06-01T00:00:00Z", tier: "coach_ai" }),
    ]);
    expect(m.get("u1")?.tier).toBe("coach_ai");
    expect(m.get("u1")?.endedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("ignores rows with no user_id", () => {
    const m = buildPayerStatusMap([row({ user_id: null })]);
    expect(m.size).toBe(0);
  });
});
