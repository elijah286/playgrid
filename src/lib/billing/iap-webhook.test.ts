import { describe, it, expect } from "vitest";
import {
  buildIapSubscriptionRow,
  reconcileIapStatus,
  resolveRevenueCatUserId,
  type RevenueCatEvent,
} from "./iap-webhook";
import { IAP_COACH_MONTHLY, IAP_COACH_ANNUAL } from "./iap-products";

const NOW = 1_700_000_000_000; // fixed "now" (ms) so tests are deterministic
const FUTURE = NOW + 30 * 24 * 3600 * 1000;
const PAST = NOW - 24 * 3600 * 1000;
const USER = "11111111-1111-1111-1111-111111111111";

function baseEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: "INITIAL_PURCHASE",
    app_user_id: USER,
    product_id: IAP_COACH_MONTHLY,
    entitlement_ids: ["coach"],
    period_type: "NORMAL",
    expiration_at_ms: FUTURE,
    environment: "PRODUCTION",
    store: "APP_STORE",
    original_transaction_id: "1000000900000001",
    transaction_id: "1000000900000009",
    ...overrides,
  };
}

describe("resolveRevenueCatUserId", () => {
  it("uses app_user_id when it is a real id", () => {
    expect(resolveRevenueCatUserId(baseEvent())).toBe(USER);
  });

  it("falls back past an anonymous app_user_id to a real alias", () => {
    const event = baseEvent({
      app_user_id: "$RCAnonymousID:abc",
      aliases: ["$RCAnonymousID:abc", USER],
    });
    expect(resolveRevenueCatUserId(event)).toBe(USER);
  });

  it("returns null when only anonymous ids are present", () => {
    expect(
      resolveRevenueCatUserId({
        app_user_id: "$RCAnonymousID:abc",
        aliases: ["$RCAnonymousID:def"],
      }),
    ).toBeNull();
  });
});

describe("reconcileIapStatus (one case per event type)", () => {
  it("INITIAL_PURCHASE, normal period → active, auto-renew on", () => {
    expect(reconcileIapStatus(baseEvent(), NOW)).toEqual({ status: "active", autoRenew: true });
  });

  it("INITIAL_PURCHASE, trial period → trialing", () => {
    expect(reconcileIapStatus(baseEvent({ period_type: "TRIAL" }), NOW)).toEqual({
      status: "trialing",
      autoRenew: true,
    });
  });

  it("RENEWAL → active", () => {
    expect(reconcileIapStatus(baseEvent({ type: "RENEWAL" }), NOW).status).toBe("active");
  });

  it("CANCELLATION while still in period → active, auto-renew OFF (entitled to expiry)", () => {
    expect(reconcileIapStatus(baseEvent({ type: "CANCELLATION" }), NOW)).toEqual({
      status: "active",
      autoRenew: false,
    });
  });

  it("CANCELLATION after expiry (refund) → expired", () => {
    expect(
      reconcileIapStatus(baseEvent({ type: "CANCELLATION", expiration_at_ms: PAST }), NOW),
    ).toEqual({ status: "expired", autoRenew: false });
  });

  it("BILLING_ISSUE → in_grace_period, still entitled", () => {
    expect(reconcileIapStatus(baseEvent({ type: "BILLING_ISSUE" }), NOW)).toEqual({
      status: "in_grace_period",
      autoRenew: true,
    });
  });

  it("EXPIRATION → expired", () => {
    expect(
      reconcileIapStatus(baseEvent({ type: "EXPIRATION", expiration_at_ms: PAST }), NOW),
    ).toEqual({ status: "expired", autoRenew: false });
  });

  it("SUBSCRIPTION_PAUSED → paused", () => {
    expect(reconcileIapStatus(baseEvent({ type: "SUBSCRIPTION_PAUSED" }), NOW).status).toBe(
      "paused",
    );
  });
});

describe("buildIapSubscriptionRow", () => {
  it("maps a Coach monthly purchase to a coach/month active row", () => {
    const res = buildIapSubscriptionRow(baseEvent(), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row).toMatchObject({
      user_id: USER,
      provider: "apple",
      tier: "coach",
      status: "active",
      store_product_id: IAP_COACH_MONTHLY,
      original_transaction_id: "1000000900000001",
      billing_interval: "month",
      environment: "production",
      auto_renew_status: true,
      rc_entitlement_id: "coach",
      last_event_type: "INITIAL_PURCHASE",
    });
    expect(res.row.current_period_end).toBe(new Date(FUTURE).toISOString());
  });

  it("derives interval from the product (annual → year), not from Apple's period", () => {
    const res = buildIapSubscriptionRow(baseEvent({ product_id: IAP_COACH_ANNUAL }), NOW);
    expect(res.ok && res.row.billing_interval).toBe("year");
  });

  it("marks the sandbox environment", () => {
    const res = buildIapSubscriptionRow(baseEvent({ environment: "SANDBOX" }), NOW);
    expect(res.ok && res.row.environment).toBe("sandbox");
  });

  it("skips unknown products", () => {
    const res = buildIapSubscriptionRow(baseEvent({ product_id: "com.foo.bar" }), NOW);
    expect(res).toEqual({ ok: false, reason: "unknown product com.foo.bar" });
  });

  it("skips non-Apple stores", () => {
    expect(buildIapSubscriptionRow(baseEvent({ store: "PLAY_STORE" }), NOW).ok).toBe(false);
  });

  it("skips anonymous-only users", () => {
    const res = buildIapSubscriptionRow(
      baseEvent({ app_user_id: "$RCAnonymousID:x", aliases: [] }),
      NOW,
    );
    expect(res.ok).toBe(false);
  });

  it("skips events with no transaction id", () => {
    const res = buildIapSubscriptionRow(
      baseEvent({ original_transaction_id: undefined, transaction_id: undefined }),
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "no original_transaction_id" });
  });
});
