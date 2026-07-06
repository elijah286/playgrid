import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferralConfig } from "@/lib/site/referral-config";

// Orchestration test for maybeAwardReferralOnActivation. The reward MATH is
// covered by the pure decideReferralReward tests; this locks the plumbing that
// moves money — most importantly that a paying sender triggers a Stripe balance
// credit with a NEGATIVE amount (a call this codebase had never made before),
// and that a free sender does not.

const config: ReferralConfig = {
  enabled: true,
  daysPerAward: 30,
  capDays: null,
  recipientTrialDays: 14,
  payerCreditCents: null,
  capAwards: 24,
  testEmails: [],
};

const createBalanceTransaction = vi.fn().mockResolvedValue({ id: "ibt_test" });
const pricesRetrieve = vi.fn().mockResolvedValue({ unit_amount: 900 });
const notifyUser = vi.fn().mockResolvedValue(undefined);

// Captured writes so tests can assert what was persisted.
let compGrantInserts: Array<Record<string, unknown>>;
let awardInserts: Array<Record<string, unknown>>;
let awardUpdates: Array<Record<string, unknown>>;
// Test knobs.
let paying: boolean;

vi.mock("@/lib/site/referral-config", () => ({
  getReferralConfig: () => Promise.resolve(config),
  isReferralActiveForUser: () => Promise.resolve(true),
}));
vi.mock("@/lib/site/stripe-config", () => ({
  getStripeConfig: () => Promise.resolve({ priceIds: { coach_month: "price_x" } }),
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () =>
    Promise.resolve({
      stripe: {
        customers: { createBalanceTransaction },
        prices: { retrieve: pricesRetrieve },
      },
      config: {},
    }),
}));
vi.mock("@/lib/notifications/inbox-dispatch", () => ({
  notifyUser: (...args: unknown[]) => notifyUser(...args),
}));

// Minimal chainable Supabase stub. Builder methods return `this`; terminals
// resolve from a per-(table, ops) resolver. Unmatched chains resolve empty.
function makeAdmin() {
  function builder(table: string) {
    const ops: unknown[][] = [];
    const b: Record<string, unknown> = {};
    const push = (name: string, args: unknown[]) => {
      ops.push([name, ...args]);
      return b;
    };
    for (const m of ["select", "eq", "in", "not", "is", "like", "order", "limit"]) {
      b[m] = (...a: unknown[]) => push(m, a);
    }
    b.insert = (a: Record<string, unknown>) => {
      if (table === "comp_grants") compGrantInserts.push(a);
      if (table === "referral_awards") awardInserts.push(a);
      return push("insert", [a]);
    };
    b.update = (a: Record<string, unknown>) => {
      if (table === "referral_awards") awardUpdates.push(a);
      return push("update", [a]);
    };
    b.delete = () => push("delete", []);
    const resolve = () => Promise.resolve(resolver(table, ops));
    b.maybeSingle = resolve;
    b.single = resolve;
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      resolve().then(res, rej);
    return b;
  }
  return { from: (t: string) => builder(t) };
}

function hasOp(ops: unknown[][], name: string): boolean {
  return ops.some((o) => o[0] === name);
}
function selectArg(ops: unknown[][]): string {
  const s = ops.find((o) => o[0] === "select");
  return s ? String(s[1] ?? "") : "";
}

function resolver(table: string, ops: unknown[][]): unknown {
  if (table === "profiles") return { data: { referred_by: "sender-1" }, error: null };
  if (table === "playbook_members")
    return { data: [{ playbook_id: "pb-1", role: "owner" }], error: null };
  if (table === "plays") return { data: { id: "play-1" }, error: null };
  if (table === "subscriptions")
    return {
      data: paying ? { stripe_customer_id: "cus_test" } : null,
      error: null,
    };
  if (table === "comp_grants") {
    if (hasOp(ops, "insert"))
      return { data: { id: `grant-${compGrantInserts.length}` }, error: null };
    return { data: null, error: null }; // no existing grant → mint fresh
  }
  if (table === "referral_awards") {
    if (hasOp(ops, "insert")) return { data: { id: "award-1" }, error: null }; // reserve
    if (hasOp(ops, "update")) return { data: null, error: null };
    // count query for the awards cap
    const sel = ops.find((o) => o[0] === "select");
    if (sel && typeof sel[2] === "object") return { count: 0, error: null };
    if (selectArg(ops).includes("days_awarded")) return { data: [], error: null };
    return { data: null, error: null }; // existing-award pre-check → none
  }
  if (table === "ui_events") return { data: null, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => makeAdmin(),
}));

async function loadFn() {
  const mod = await import("./referral-award");
  return mod.maybeAwardReferralOnActivation;
}

describe("maybeAwardReferralOnActivation — money plumbing", () => {
  beforeEach(() => {
    compGrantInserts = [];
    awardInserts = [];
    awardUpdates = [];
    createBalanceTransaction.mockClear();
    notifyUser.mockClear();
    paying = false;
    vi.resetModules();
  });

  it("free sender → comp days, no Stripe charge", async () => {
    paying = false;
    const run = await loadFn();
    const res = await run({ recipientId: "recip-1", trigger: "play_created" });

    expect(res).toMatchObject({ awarded: true, rewardKind: "comp_days", senderDays: 30 });
    expect(createBalanceTransaction).not.toHaveBeenCalled();
    // sender comp grant minted (note starts "Referral credit")
    expect(
      compGrantInserts.some((g) => String(g.note).startsWith("Referral credit")),
    ).toBe(true);
    // recipient welcome trial minted too (double-sided)
    expect(
      compGrantInserts.some((g) => String(g.note).startsWith("Referral welcome trial")),
    ).toBe(true);
    // reservation happened before the final detail update
    expect(awardInserts).toHaveLength(1);
    expect(awardUpdates).toHaveLength(1);
    expect(awardUpdates[0]).toMatchObject({ reward_kind: "comp_days", days_awarded: 30 });
  });

  it("paying sender → Stripe balance credit with a NEGATIVE amount, no sender comp grant", async () => {
    paying = true;
    const run = await loadFn();
    const res = await run({ recipientId: "recip-2", trigger: "copy_claim" });

    expect(res).toMatchObject({ awarded: true, rewardKind: "stripe_credit", senderCreditCents: 900 });
    expect(createBalanceTransaction).toHaveBeenCalledTimes(1);
    const [customerId, params] = createBalanceTransaction.mock.calls[0]!;
    expect(customerId).toBe("cus_test");
    expect(params.amount).toBe(-900); // credit, not a charge
    expect(params.currency).toBe("usd");
    // No SENDER comp grant on the Stripe path (recipient trial is still comp).
    expect(
      compGrantInserts.some((g) => String(g.note).startsWith("Referral credit")),
    ).toBe(false);
    expect(awardUpdates[0]).toMatchObject({
      reward_kind: "stripe_credit",
      credit_cents: 900,
      stripe_balance_txn_id: "ibt_test",
    });
  });
});
