import type { SubscriptionTier } from "./entitlement";
import { isTerminalSubscriptionStatus } from "./former-subscription";

/**
 * Account status for a paying (or formerly-paying) customer, as shown in the
 * revenue dashboard. The raw Stripe status alone isn't enough — an `active`
 * subscription with `cancel_at_period_end` is materially different from a plain
 * `active` one (the coach has churned, they just haven't lapsed yet), and the
 * dashboard needs to badge those distinctly.
 *
 *   active     → paying, renewing
 *   trialing   → in trial, not yet charged
 *   past_due   → payment failing, still entitled for now
 *   canceling  → active but set to end at period end (red flag, still has access)
 *   cancelled  → terminal (canceled / unpaid / incomplete_expired) — access gone
 *   one_time   → no subscription row at all; paid via a one-time purchase
 */
export type PayerBadge =
  | "active"
  | "trialing"
  | "past_due"
  | "canceling"
  | "cancelled"
  | "one_time";

export type PayerSubscriptionState = {
  badge: PayerBadge;
  tier: SubscriptionTier;
  /** Raw Stripe subscription status. */
  status: string;
  /** Renewal/expiry boundary — when access renews (active) or ends (canceling). */
  currentPeriodEnd: string | null;
  /** Explicit cancel timestamp, when Stripe scheduled one. */
  cancelAt: string | null;
  /** True when the sub is flagged to stop at period end. */
  cancelAtPeriodEnd: boolean;
  /** Billing cadence, when known. */
  billingInterval: string | null;
  /** When a terminal subscription effectively ended. */
  endedAt: string | null;
};

/** Minimal `subscriptions` row shape needed to classify payer status. */
export type PayerSubscriptionRow = {
  user_id: string | null;
  tier: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  cancel_at_period_end: boolean | null;
  billing_interval: string | null;
  updated_at: string | null;
};

/**
 * Active set mirrors the `user_entitlements` view: these statuses still grant
 * entitlement. Everything else is terminal.
 */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function isActiveStatus(status: string | null): boolean {
  return status != null && ACTIVE_STATUSES.has(status);
}

/** Sort key for "which subscription row best represents this user right now". */
function recencyKey(r: PayerSubscriptionRow): string {
  return r.current_period_end ?? r.updated_at ?? "";
}

function classify(r: PayerSubscriptionRow): PayerSubscriptionState {
  const tier = (r.tier as SubscriptionTier) ?? "coach";
  const status = r.status ?? "";
  const cancelAtPeriodEnd = r.cancel_at_period_end ?? false;
  const base: Omit<PayerSubscriptionState, "badge"> = {
    tier,
    status,
    currentPeriodEnd: r.current_period_end,
    cancelAt: r.cancel_at,
    cancelAtPeriodEnd,
    billingInterval: r.billing_interval,
    endedAt: isTerminalSubscriptionStatus(status)
      ? r.current_period_end ?? r.updated_at ?? null
      : null,
  };

  let badge: PayerBadge;
  if (isActiveStatus(status)) {
    if (status === "trialing") badge = "trialing";
    else if (status === "past_due") badge = "past_due";
    else if (cancelAtPeriodEnd || r.cancel_at) badge = "canceling";
    else badge = "active";
  } else {
    badge = "cancelled";
  }
  return { ...base, badge };
}

/**
 * Pick the single most-relevant subscription per user and classify it.
 *
 * A user can accumulate several `subscriptions` rows over time (cancel →
 * re-subscribe → cancel again). Precedence:
 *   1. Any currently-active row (active/trialing/past_due) wins over a terminal
 *      one — a re-subscriber should read as "active", not "cancelled".
 *   2. Within the same active/terminal class, the row with the latest
 *      period-end (else latest update) wins.
 */
export function buildPayerStatusMap(
  rows: PayerSubscriptionRow[],
): Map<string, PayerSubscriptionState> {
  // Track the winning raw row per user so comparisons stay on raw fields.
  const best = new Map<string, PayerSubscriptionRow>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const prev = best.get(r.user_id);
    if (!prev) {
      best.set(r.user_id, r);
      continue;
    }
    const rActive = isActiveStatus(r.status);
    const prevActive = isActiveStatus(prev.status);
    if (rActive !== prevActive) {
      if (rActive) best.set(r.user_id, r);
      continue;
    }
    // Same class — newer period-end/update wins.
    if (recencyKey(r) > recencyKey(prev)) best.set(r.user_id, r);
  }

  const out = new Map<string, PayerSubscriptionState>();
  for (const [userId, row] of best) out.set(userId, classify(row));
  return out;
}
