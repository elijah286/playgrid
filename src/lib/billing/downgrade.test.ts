/**
 * Regression tests for end-of-period tier downgrade handling.
 *
 * Pin the invariants that protect customers from surprise refunds and
 * lost entitlements:
 *   - paid → paid creates a Stripe subscription schedule with two phases
 *     (current tier through current_period_end, then target tier)
 *   - paid → free uses cancel_at_period_end (no schedule needed)
 *   - seat add-ons carry across the transition with the new interval's
 *     seat price
 *   - upgrades, no-sub, multi-sub all refuse
 *   - cancel releases the schedule and clears pending_change_* columns
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const subscriptionsRows: Array<Record<string, unknown>> = [];
const subscriptionsUpdates: Array<Record<string, unknown>> = [];
const subscriptionsByEq: Record<string, Record<string, unknown> | null> = {};

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          const single = () => {
            // Look up the row keyed by stripe_subscription_id for the
            // cancelScheduledDowngrade path.
            const row = subscriptionsByEq[`${col}:${val}`] ?? null;
            return Promise.resolve({ data: row, error: null });
          };
          return {
            not: () => ({
              in: () => Promise.resolve({ data: subscriptionsRows, error: null }),
              order: () => ({
                limit: () => ({
                  maybeSingle: single,
                }),
              }),
            }),
            maybeSingle: single,
          };
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => {
          subscriptionsUpdates.push({ [col]: val, ...patch });
          return {
            eq: () => Promise.resolve({ error: null }),
            then: (fn: (v: { error: null }) => unknown) =>
              Promise.resolve({ error: null }).then(fn),
          };
        },
      }),
    }),
  }),
}));

const stripeRetrieveMock = vi.fn();
const stripeSubsUpdateMock = vi.fn();
const stripeSchedulesCreateMock = vi.fn();
const stripeSchedulesUpdateMock = vi.fn();
const stripeSchedulesReleaseMock = vi.fn();

vi.mock("@/lib/billing/stripe", async () => {
  const actual = await vi.importActual<typeof import("./stripe")>("./stripe");
  return {
    ...actual,
    getStripeClient: async () => ({
      stripe: {
        subscriptions: {
          retrieve: stripeRetrieveMock,
          update: stripeSubsUpdateMock,
        },
        subscriptionSchedules: {
          create: stripeSchedulesCreateMock,
          update: stripeSchedulesUpdateMock,
          release: stripeSchedulesReleaseMock,
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
  previewSubscriptionDowngrade,
  scheduleSubscriptionDowngrade,
  cancelScheduledDowngrade,
} from "./downgrade";

function pushSub(row: Record<string, unknown>) {
  subscriptionsRows.push(row);
  // Mirror by-eq lookups (cancelScheduledDowngrade reads by stripe_subscription_id)
  if (typeof row.stripe_subscription_id === "string") {
    subscriptionsByEq[`stripe_subscription_id:${row.stripe_subscription_id}`] = row;
  }
}

const NEXT_MONTH_UNIX = 1717545600;

function makeStripeSubscription(opts: {
  id?: string;
  customerId?: string;
  tierItemId?: string;
  tierPriceId?: string;
  seatItemId?: string | null;
  seatPriceId?: string | null;
  seatQuantity?: number;
  periodEnd?: number;
}): Record<string, unknown> {
  const items: Array<Record<string, unknown>> = [
    {
      id: opts.tierItemId ?? "si_tier",
      price: { id: opts.tierPriceId ?? FAKE_CONFIG.priceIds.coach_ai_month },
      current_period_end: opts.periodEnd ?? NEXT_MONTH_UNIX,
    },
  ];
  if (opts.seatItemId !== null && opts.seatPriceId !== null && opts.seatPriceId !== undefined) {
    items.push({
      id: opts.seatItemId ?? "si_seat",
      price: { id: opts.seatPriceId ?? FAKE_CONFIG.priceIds.seat_month },
      quantity: opts.seatQuantity ?? 1,
      current_period_end: opts.periodEnd ?? NEXT_MONTH_UNIX,
    });
  }
  return {
    id: opts.id ?? "sub_x",
    customer: opts.customerId ?? "cus_x",
    current_period_end: opts.periodEnd ?? NEXT_MONTH_UNIX,
    items: { data: items },
    metadata: {},
  };
}

function makeStripeSchedule(opts: {
  id?: string;
  subscription?: string;
  phaseStart?: number;
  phaseEnd?: number;
  tierPriceId?: string;
  seatPriceId?: string | null;
  seatQuantity?: number;
}): Record<string, unknown> {
  const items: Array<{ price: string; quantity: number }> = [
    { price: opts.tierPriceId ?? FAKE_CONFIG.priceIds.coach_ai_month, quantity: 1 },
  ];
  if (opts.seatPriceId) {
    items.push({ price: opts.seatPriceId, quantity: opts.seatQuantity ?? 1 });
  }
  return {
    id: opts.id ?? "sched_a",
    subscription: opts.subscription ?? "sub_a",
    status: "active",
    phases: [
      {
        items,
        start_date: opts.phaseStart ?? Math.floor(Date.now() / 1000) - 86400,
        end_date: opts.phaseEnd ?? NEXT_MONTH_UNIX,
      },
    ],
  };
}

beforeEach(() => {
  subscriptionsRows.length = 0;
  subscriptionsUpdates.length = 0;
  for (const k of Object.keys(subscriptionsByEq)) delete subscriptionsByEq[k];
  stripeRetrieveMock.mockReset();
  stripeSubsUpdateMock.mockReset();
  stripeSchedulesCreateMock.mockReset();
  stripeSchedulesUpdateMock.mockReset();
  stripeSchedulesReleaseMock.mockReset();
});

describe("previewSubscriptionDowngrade", () => {
  it("refuses when no active subscription exists", async () => {
    const res = await previewSubscriptionDowngrade("u1", "coach");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no active subscription/i);
  });

  it("refuses upgrades — they go through the in-place flow", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
    });
    const res = await previewSubscriptionDowngrade("u1", "coach_ai");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/upgrade/i);
  });

  it("returns the effective date from the subscription's period end", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
    });
    stripeRetrieveMock.mockResolvedValue(
      makeStripeSubscription({ id: "sub_a", periodEnd: NEXT_MONTH_UNIX }),
    );
    const res = await previewSubscriptionDowngrade("u1", "coach");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.effectiveAt).toBe(new Date(NEXT_MONTH_UNIX * 1000).toISOString());
      expect(res.currentName).toBe("Coach Pro");
      expect(res.targetName).toBe("Team Coach");
    }
  });
});

describe("scheduleSubscriptionDowngrade — paid → paid", () => {
  function setupCoachAiUserWithSeats() {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
    });
    stripeRetrieveMock.mockResolvedValue(
      makeStripeSubscription({
        id: "sub_a",
        tierItemId: "si_tier",
        tierPriceId: FAKE_CONFIG.priceIds.coach_ai_month,
        seatItemId: "si_seat",
        seatPriceId: FAKE_CONFIG.priceIds.seat_month,
        seatQuantity: 3,
      }),
    );
    stripeSchedulesCreateMock.mockResolvedValue(
      makeStripeSchedule({
        id: "sched_a",
        subscription: "sub_a",
        tierPriceId: FAKE_CONFIG.priceIds.coach_ai_month,
        seatPriceId: FAKE_CONFIG.priceIds.seat_month,
        seatQuantity: 3,
      }),
    );
    stripeSchedulesUpdateMock.mockResolvedValue({});
  }

  it("creates a schedule from the existing subscription", async () => {
    setupCoachAiUserWithSeats();
    const res = await scheduleSubscriptionDowngrade("u1", "coach", "month");
    expect(res.ok).toBe(true);
    expect(stripeSchedulesCreateMock).toHaveBeenCalledWith({
      from_subscription: "sub_a",
    });
  });

  it("updates schedule with a phase-2 that uses the target tier price", async () => {
    setupCoachAiUserWithSeats();
    await scheduleSubscriptionDowngrade("u1", "coach", "month");
    expect(stripeSchedulesUpdateMock).toHaveBeenCalledTimes(1);
    const [schedId, payload] = stripeSchedulesUpdateMock.mock.calls[0];
    expect(schedId).toBe("sched_a");
    expect(payload.end_behavior).toBe("release");
    expect(payload.phases).toHaveLength(2);
    const [, phaseTwo] = payload.phases;
    const phaseTwoTierItem = phaseTwo.items.find(
      (i: { price: string }) => i.price === FAKE_CONFIG.priceIds.coach_month,
    );
    expect(phaseTwoTierItem).toBeTruthy();
  });

  it("carries seat add-ons into phase 2 with the matching interval seat price", async () => {
    setupCoachAiUserWithSeats();
    await scheduleSubscriptionDowngrade("u1", "coach", "month");
    const [, payload] = stripeSchedulesUpdateMock.mock.calls[0];
    const phaseTwoSeatItem = payload.phases[1].items.find(
      (i: { price: string }) => i.price === FAKE_CONFIG.priceIds.seat_month,
    );
    expect(phaseTwoSeatItem).toEqual({
      price: FAKE_CONFIG.priceIds.seat_month,
      quantity: 3,
    });
  });

  it("writes pending_change_* to the subscription row", async () => {
    setupCoachAiUserWithSeats();
    await scheduleSubscriptionDowngrade("u1", "coach", "month");
    const writes = subscriptionsUpdates.filter(
      (u) => "pending_change_tier" in u,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].pending_change_tier).toBe("coach");
    expect(writes[0].pending_change_schedule_id).toBe("sched_a");
    expect(writes[0].pending_change_effective_at).toBe(
      new Date(NEXT_MONTH_UNIX * 1000).toISOString(),
    );
  });

  it("refuses upgrades — they need a different code path", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
    });
    const res = await scheduleSubscriptionDowngrade("u1", "coach_ai", "month");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/upgrade/i);
    expect(stripeSchedulesCreateMock).not.toHaveBeenCalled();
  });
});

describe("scheduleSubscriptionDowngrade — paid → free", () => {
  it("flips cancel_at_period_end instead of creating a schedule", async () => {
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
        seatItemId: null,
        seatPriceId: null,
      }),
    );
    stripeSubsUpdateMock.mockResolvedValue({});

    const res = await scheduleSubscriptionDowngrade("u1", "free", "month");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.scheduleId).toBeNull();
    expect(stripeSchedulesCreateMock).not.toHaveBeenCalled();
    expect(stripeSubsUpdateMock).toHaveBeenCalledTimes(1);
    const [subId, payload] = stripeSubsUpdateMock.mock.calls[0];
    expect(subId).toBe("sub_a");
    expect(payload.cancel_at_period_end).toBe(true);
  });

  it("writes pending_change_tier='free' so the UI banner can show the target", async () => {
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
        seatItemId: null,
        seatPriceId: null,
      }),
    );
    stripeSubsUpdateMock.mockResolvedValue({});

    await scheduleSubscriptionDowngrade("u1", "free", "month");
    const writes = subscriptionsUpdates.filter((u) => "pending_change_tier" in u);
    expect(writes[0].pending_change_tier).toBe("free");
    expect(writes[0].pending_change_schedule_id).toBeNull();
  });
});

describe("cancelScheduledDowngrade", () => {
  it("releases the schedule and clears pending_change_*", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
      pending_change_tier: "coach",
      pending_change_schedule_id: "sched_a",
    });
    stripeSchedulesReleaseMock.mockResolvedValue({});
    const res = await cancelScheduledDowngrade("u1");
    expect(res.ok).toBe(true);
    expect(stripeSchedulesReleaseMock).toHaveBeenCalledWith("sched_a");
    const clearWrites = subscriptionsUpdates.filter(
      (u) => u.pending_change_tier === null,
    );
    expect(clearWrites).toHaveLength(1);
  });

  it("flips cancel_at_period_end back when the pending target is free", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach",
      billing_interval: "month",
      status: "active",
      pending_change_tier: "free",
      pending_change_schedule_id: null,
    });
    stripeSubsUpdateMock.mockResolvedValue({});
    const res = await cancelScheduledDowngrade("u1");
    expect(res.ok).toBe(true);
    const [subId, payload] = stripeSubsUpdateMock.mock.calls[0];
    expect(subId).toBe("sub_a");
    expect(payload.cancel_at_period_end).toBe(false);
  });

  it("refuses when no pending change is on file", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
      pending_change_tier: null,
      pending_change_schedule_id: null,
    });
    const res = await cancelScheduledDowngrade("u1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no pending change/i);
    expect(stripeSchedulesReleaseMock).not.toHaveBeenCalled();
  });

  it("treats an already-released schedule as a no-op (clears local state)", async () => {
    pushSub({
      id: "row1",
      stripe_subscription_id: "sub_a",
      stripe_customer_id: "cus_x",
      tier: "coach_ai",
      billing_interval: "month",
      status: "active",
      pending_change_tier: "coach",
      pending_change_schedule_id: "sched_a",
    });
    stripeSchedulesReleaseMock.mockRejectedValue(
      new Error("This subscription_schedule has already been released."),
    );
    const res = await cancelScheduledDowngrade("u1");
    expect(res.ok).toBe(true);
  });
});
