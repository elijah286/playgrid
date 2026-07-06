import { describe, expect, it } from "vitest";
import type { ReferralConfig } from "@/lib/site/referral-config";
import { decideReferralReward } from "./referral-award";

const BASE: ReferralConfig = {
  enabled: true,
  daysPerAward: 30,
  capDays: null,
  recipientTrialDays: 14,
  payerCreditCents: null,
  capAwards: 24,
  testEmails: [],
};

const ctx = (over: Partial<Parameters<typeof decideReferralReward>[1]> = {}) => ({
  isPayer: false,
  autoPriceCents: null,
  priorAwardCount: 0,
  priorCompDaysAwarded: 0,
  ...over,
});

describe("decideReferralReward", () => {
  it("free sender → comp days + recipient trial", () => {
    const d = decideReferralReward(BASE, ctx());
    expect(d).toMatchObject({
      award: true,
      kind: "comp_days",
      compDays: 30,
      creditCents: 0,
      recipientDays: 14,
    });
  });

  it("paying sender on auto → one month of the fetched price as a credit", () => {
    const d = decideReferralReward(BASE, ctx({ isPayer: true, autoPriceCents: 900 }));
    expect(d).toMatchObject({
      award: true,
      kind: "stripe_credit",
      creditCents: 900,
      compDays: 0,
      recipientDays: 14,
    });
  });

  it("paying sender with a fixed credit ignores the auto price", () => {
    const d = decideReferralReward(
      { ...BASE, payerCreditCents: 500 },
      ctx({ isPayer: true, autoPriceCents: 900 }),
    );
    expect(d).toMatchObject({ award: true, kind: "stripe_credit", creditCents: 500 });
  });

  it("paying sender with no usable price falls back to comp days (never a $0 credit)", () => {
    const noPrice = decideReferralReward(BASE, ctx({ isPayer: true, autoPriceCents: null }));
    expect(noPrice).toMatchObject({ award: true, kind: "comp_days", compDays: 30 });

    const zeroFixed = decideReferralReward(
      { ...BASE, payerCreditCents: 0 },
      ctx({ isPayer: true, autoPriceCents: 900 }),
    );
    expect(zeroFixed).toMatchObject({ award: true, kind: "comp_days" });
  });

  it("stops at the awards cap regardless of reward kind", () => {
    expect(decideReferralReward(BASE, ctx({ priorAwardCount: 24 }))).toEqual({
      award: false,
      reason: "sender-at-award-cap",
    });
    // A payer is capped too.
    expect(
      decideReferralReward(BASE, ctx({ isPayer: true, autoPriceCents: 900, priorAwardCount: 24 })),
    ).toEqual({ award: false, reason: "sender-at-award-cap" });
  });

  it("no awards cap when capAwards is null", () => {
    const d = decideReferralReward(
      { ...BASE, capAwards: null },
      ctx({ priorAwardCount: 9999 }),
    );
    expect(d.award).toBe(true);
  });

  it("prorates comp days against the legacy day cap", () => {
    const d = decideReferralReward(
      { ...BASE, capDays: 60 },
      ctx({ priorCompDaysAwarded: 45 }),
    );
    // min(30 per-award, 60 - 45 remaining) = 15
    expect(d).toMatchObject({ award: true, kind: "comp_days", compDays: 15 });
  });

  it("refuses when the day cap is exhausted", () => {
    const d = decideReferralReward(
      { ...BASE, capDays: 30 },
      ctx({ priorCompDaysAwarded: 30 }),
    );
    expect(d).toEqual({ award: false, reason: "sender-at-day-cap" });
  });

  it("day cap does not constrain a paying sender's Stripe credit", () => {
    const d = decideReferralReward(
      { ...BASE, capDays: 30 },
      ctx({ isPayer: true, autoPriceCents: 900, priorCompDaysAwarded: 100 }),
    );
    expect(d).toMatchObject({ award: true, kind: "stripe_credit", creditCents: 900 });
  });

  it("recipientTrialDays 0 → one-sided (no recipient reward)", () => {
    const d = decideReferralReward({ ...BASE, recipientTrialDays: 0 }, ctx());
    expect(d).toMatchObject({ award: true, recipientDays: 0 });
  });
});
