/**
 * Regression tests for tier-change handling.
 *
 * Pin the invariants that block double-billing:
 *   - upgrade calls stripe.subscriptions.update (not checkout.sessions.create)
 *   - seat add-on items survive a tier swap (only the base item is mutated)
 *   - downgrades, same-tier, no-subscription, multi-subscription all refuse
 *   - the new tier metadata is stamped onto the Stripe subscription
 *
 * Pre-2026-05-20 the upgrade path silently spun up a parallel subscription
 * via Checkout — these tests are the cell that prevents that regression.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const subscriptionsRows: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            in: () => Promise.resolve({ data: subscriptionsRows, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

const stripeRetrieveMock = vi.fn();
const stripeUpdateMock = vi.fn();
const stripeCreatePreviewMock = vi.fn();

vi.mock("@/lib/billing/stripe", async () => {
  const actual = await vi.importActual<typeof import("./stripe")>("./stripe");
  return {
    ...actual,
    getStripeClient: async () => ({
      stripe: {
        subscriptions: {
          retrieve: stripeRetrieveMock,
          update: stripeUpdateMock,
        },
        invoices: {
          createPreview: stripeCreatePreviewMock,
        },
      },
      config: FAKE_CONFIG,
    }),
  };
});

const FAKE_CONFIG = {
  secretKey: "sk_test_x",
  publishableKey: null,
  webhookSecret: null,
  priceIds: {
    coach_month: "price_coach_m",
    coach_year: "price_coach_y",
    coach_ai_month: "price_coach_ai_m",
    coach_ai_year: "price_coach_ai_y",
    seat_month: "price_seat_m",
    seat_year: "price_seat_y",
    coach_cal_pack: null,
  },
} as const;

import {
  TIER_RANK,
  isUpgrade,
  isDowngrade,
  findTierItem,
  previewSubscriptionChange,
  executeSubscriptionUpgrade,
} from "./upgrade";

function pushSub(row: Record<string, unknown>) {
  subscriptionsRows.push(row);
}

function makeStripeSubscription(opts: {
  id?: string;
  customerId?: string;
  tierItemId?: string;
  tierPriceId?: string;
  seatItemId?: string | null;
  seatPriceId?: string | null;
  seatQuantity?: number;
}): Record<string, unknown> {
  const items: Array<Record<string, unknown>> = [
    {
      id: opts.tierItemId ?? "si_tier",
      price: { id: opts.tierPriceId ?? FAKE_CONFIG.priceIds.coach_month },
    },
  ];
  if (opts.seatItemId !== null && opts.seatPriceId !== null) {
    items.push({
      id: opts.seatItemId ?? "si_seat",
      price: { id: opts.seatPriceId ?? FAKE_CONFIG.priceIds.seat_month },
      quantity: opts.seatQuantity ?? 1,
    });
  }
  return {
    id: opts.id ?? "sub_x",
    customer: opts.customerId ?? "cus_x",
    items: { data: items },
  };
}

beforeEach(() => {
  subscriptionsRows.length = 0;
  stripeRetrieveMock.mockReset();
  stripeUpdateMock.mockReset();
  stripeCreatePreviewMock.mockReset();
});

describe("tier rank helpers", () => {
  it("orders free < coach < coach_ai", () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.coach);
    expect(TIER_RANK.coach).toBeLessThan(TIER_RANK.coach_ai);
  });

  it("isUpgrade is strict — same tier is not an upgrade", () => {
    expect(isUpgrade("coach", "coach_ai")).toBe(true);
    expect(isUpgrade("free", "coach")).toBe(true);
    expect(isUpgrade("coach", "coach")).toBe(false);
    expect(isUpgrade("coach_ai", "coach")).toBe(false);
  });

  it("isDowngrade is strict — same tier is not a downgrade", () => {
    expect(isDowngrade("coach_ai", "coach")).toBe(true);
    expect(isDowngrade("coach", "free")).toBe(true);
    expect(isDowngrade("coach", "coach")).toBe(false);
    expect(isDowngrade("coach", "coach_ai")).toBe(false);
  });
});

describe("findTierItem", () => {
  it("returns the non-seat tier-priced item, skipping seat add-ons", () => {
    const sub = makeStripeSubscription({
      tierItemId: "si_tier_real",
      tierPriceId: FAKE_CONFIG.priceIds.coach_month,
      seatItemId: "si_seat_real",
      seatPriceId: FAKE_CONFIG.priceIds.seat_month,
    }) as unknown as import("stripe").Stripe.Subscription;
    const item = findTierItem(sub, FAKE_CONFIG as never);
    expect(item?.id).toBe("si_tier_real");
  });

  it("returns null when no tier-priced item is present (unexpected shape)", () => {
    const sub = {
      id: "sub_weird",
      items: {
        data: [
          { id: "si_seat", price: { id: FAKE_CONFIG.priceIds.seat_month } },
          { id: "si_random", price: { id: "price_unknown" } },
        ],
      },
    } as unknown as import("stripe").Stripe.Subscription;
    expect(findTierItem(sub, FAKE_CONFIG as never)).toBeNull();
  });
});

describe("previewSubscriptionChange", () => {
  it("refuses when no active subscription exists", async () => {
    const res = await previewSubscriptionChange("u1", "coach_ai", "month");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no active subscription/i);
  });

  it("refuses when multiple active subscriptions exist (legacy bug state)", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
    });
    pushSub({
      id: "row2",
      stripe_subscription_id: "sub_b",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
    });
    const res = await previewSubscriptionChange("u1", "coach_ai", "month");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/multiple active subscriptions/i);
  });

  it("refuses downgrades — they need a different code path", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
    });
    const res = await previewSubscriptionChange("u1", "coach", "month");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/downgrade/i);
  });

  it("returns the prorated amount and renewal date from Stripe", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
    });
    stripeRetrieveMock.mockResolvedValue(
      makeStripeSubscription({
        id: "sub_a",
        tierPriceId: FAKE_CONFIG.priceIds.coach_month,
      }),
    );
    stripeCreatePreviewMock.mockResolvedValue({
      amount_due: 1427,
      currency: "usd",
      lines: {
        data: [
          {
            description: "Unused time on Team Coach",
            amount: -325,
            period: { end: 1717545600 },
          },
          {
            description: "Coach Pro (prorated)",
            amount: 1752,
            period: { end: 1717545600 },
          },
        ],
      },
    });
    const res = await previewSubscriptionChange("u1", "coach_ai", "month");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.amountDueNow).toBe(1427);
      expect(res.currency).toBe("usd");
      expect(res.lines).toHaveLength(2);
      expect(res.lines[0].amount).toBe(-325);
      expect(res.nextRenewalAt).toBe(new Date(1717545600 * 1000).toISOString());
    }
  });
});

describe("executeSubscriptionUpgrade", () => {
  function setupCoachUserWithSeats() {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
    });
    stripeRetrieveMock.mockResolvedValue(
      makeStripeSubscription({
        id: "sub_a",
        tierItemId: "si_tier_real",
        tierPriceId: FAKE_CONFIG.priceIds.coach_month,
        seatItemId: "si_seat_real",
        seatPriceId: FAKE_CONFIG.priceIds.seat_month,
        seatQuantity: 3,
      }),
    );
    stripeUpdateMock.mockResolvedValue({ id: "sub_a" });
  }

  it("swaps only the base tier item — seat items are not in the update payload", async () => {
    setupCoachUserWithSeats();
    const res = await executeSubscriptionUpgrade("u1", "coach_ai", "month");
    expect(res.ok).toBe(true);
    expect(stripeUpdateMock).toHaveBeenCalledTimes(1);
    const [subId, payload] = stripeUpdateMock.mock.calls[0];
    expect(subId).toBe("sub_a");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toEqual({
      id: "si_tier_real",
      price: FAKE_CONFIG.priceIds.coach_ai_month,
    });
    // Sanity: the seat item id is NOT in the payload — Stripe leaves
    // unmentioned items alone, which is exactly what we want.
    expect(JSON.stringify(payload.items)).not.toContain("si_seat_real");
  });

  it("uses create_prorations and stamps tier metadata", async () => {
    setupCoachUserWithSeats();
    await executeSubscriptionUpgrade("u1", "coach_ai", "month");
    const [, payload] = stripeUpdateMock.mock.calls[0];
    expect(payload.proration_behavior).toBe("create_prorations");
    expect(payload.metadata).toEqual({
      user_id: "u1",
      tier: "coach_ai",
      interval: "month",
    });
  });

  it("supports monthly → annual upgrades (interval can change in the same call)", async () => {
    setupCoachUserWithSeats();
    await executeSubscriptionUpgrade("u1", "coach_ai", "year");
    const [, payload] = stripeUpdateMock.mock.calls[0];
    expect(payload.items[0].price).toBe(FAKE_CONFIG.priceIds.coach_ai_year);
  });

  it("refuses when target tier matches current tier+interval", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
    });
    const res = await executeSubscriptionUpgrade("u1", "coach", "month");
    expect(res.ok).toBe(false);
    expect(stripeUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses downgrades — they need a different code path", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
    });
    const res = await executeSubscriptionUpgrade("u1", "coach", "month");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/downgrade/i);
    expect(stripeUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses when no active subscription exists — guard against bypass", async () => {
    const res = await executeSubscriptionUpgrade("u1", "coach_ai", "month");
    expect(res.ok).toBe(false);
    expect(stripeUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses when multiple active subscriptions exist (legacy double-billing case)", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
    });
    pushSub({
      id: "row2",
      stripe_subscription_id: "sub_b",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
    });
    const res = await executeSubscriptionUpgrade("u1", "coach_ai", "month");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/multiple/i);
    expect(stripeUpdateMock).not.toHaveBeenCalled();
  });
});
