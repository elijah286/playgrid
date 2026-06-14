import { describe, it, expect } from "vitest";
import { deriveAppleStatus, buildIapRowFromTransaction } from "./apple-iap-map";
import { IAP_COACH_MONTHLY, IAP_COACH_ANNUAL } from "./iap-products";
import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 30 * 864e5;
const PAST = NOW - 864e5;
const USER = "11111111-1111-1111-1111-111111111111";

function tx(over: Partial<JWSTransactionDecodedPayload> = {}): JWSTransactionDecodedPayload {
  return {
    productId: IAP_COACH_MONTHLY,
    transactionId: "2000000001",
    originalTransactionId: "1000000001",
    expiresDate: FUTURE,
    appAccountToken: USER,
    environment: "Production",
    ...over,
  } as JWSTransactionDecodedPayload;
}

describe("deriveAppleStatus (one case per branch)", () => {
  it("active subscription, no notification → active + auto-renew", () => {
    expect(
      deriveAppleStatus({ expiresDateMs: FUTURE, revocationDateMs: null, nowMs: NOW, isTrial: false }),
    ).toEqual({ status: "active", autoRenew: true });
  });
  it("free trial → trialing", () => {
    expect(
      deriveAppleStatus({ expiresDateMs: FUTURE, revocationDateMs: null, nowMs: NOW, isTrial: true })
        .status,
    ).toBe("trialing");
  });
  it("revoked (refund) → expired", () => {
    expect(
      deriveAppleStatus({ expiresDateMs: FUTURE, revocationDateMs: PAST, nowMs: NOW, isTrial: false }),
    ).toEqual({ status: "expired", autoRenew: false });
  });
  it("EXPIRED notification → expired", () => {
    expect(
      deriveAppleStatus({
        expiresDateMs: PAST, revocationDateMs: null, nowMs: NOW, isTrial: false,
        notificationType: "EXPIRED",
      }).status,
    ).toBe("expired");
  });
  it("DID_FAIL_TO_RENEW + GRACE_PERIOD → in_grace_period (still entitled)", () => {
    expect(
      deriveAppleStatus({
        expiresDateMs: PAST, revocationDateMs: null, nowMs: NOW, isTrial: false,
        notificationType: "DID_FAIL_TO_RENEW", subtype: "GRACE_PERIOD",
      }),
    ).toEqual({ status: "in_grace_period", autoRenew: true });
  });
  it("DID_FAIL_TO_RENEW without grace → billing_retry (not entitled)", () => {
    expect(
      deriveAppleStatus({
        expiresDateMs: PAST, revocationDateMs: null, nowMs: NOW, isTrial: false,
        notificationType: "DID_FAIL_TO_RENEW",
      }).status,
    ).toBe("billing_retry");
  });
  it("auto-renew disabled but still in period → active, auto-renew off", () => {
    expect(
      deriveAppleStatus({
        expiresDateMs: FUTURE, revocationDateMs: null, nowMs: NOW, isTrial: false,
        notificationType: "DID_CHANGE_RENEWAL_STATUS", subtype: "AUTO_RENEW_DISABLED",
      }),
    ).toEqual({ status: "active", autoRenew: false });
  });
});

describe("buildIapRowFromTransaction", () => {
  it("maps a Coach monthly purchase to a coach/month active row", () => {
    const res = buildIapRowFromTransaction(tx(), { userId: USER, nowMs: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row).toMatchObject({
      user_id: USER,
      provider: "apple",
      tier: "coach",
      status: "active",
      store_product_id: IAP_COACH_MONTHLY,
      original_transaction_id: "1000000001",
      billing_interval: "month",
      environment: "production",
      auto_renew_status: true,
    });
    expect(res.row.current_period_end).toBe(new Date(FUTURE).toISOString());
  });
  it("resolves the user from appAccountToken when no session user is passed", () => {
    const res = buildIapRowFromTransaction(tx(), { nowMs: NOW });
    expect(res.ok && res.row.user_id).toBe(USER);
  });
  it("annual product → year interval", () => {
    const res = buildIapRowFromTransaction(tx({ productId: IAP_COACH_ANNUAL }), { userId: USER, nowMs: NOW });
    expect(res.ok && res.row.billing_interval).toBe("year");
  });
  it("marks sandbox environment", () => {
    const res = buildIapRowFromTransaction(
      tx({ environment: "Sandbox" as JWSTransactionDecodedPayload["environment"] }),
      { userId: USER, nowMs: NOW },
    );
    expect(res.ok && res.row.environment).toBe("sandbox");
  });
  it("skips unknown products", () => {
    const res = buildIapRowFromTransaction(tx({ productId: "com.foo.bar" }), { userId: USER, nowMs: NOW });
    expect(res).toEqual({ ok: false, reason: "unknown product com.foo.bar" });
  });
  it("skips when no user is resolvable", () => {
    const res = buildIapRowFromTransaction(tx({ appAccountToken: undefined }), { nowMs: NOW });
    expect(res.ok).toBe(false);
  });
});
