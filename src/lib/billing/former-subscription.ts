import type { SubscriptionTier } from "./entitlement";

/**
 * A paid Stripe subscription the user once held that has since lapsed. Used by
 * the admin users list to flag churned ex-payers — coaches who were paying and
 * cancelled (or whose subscription went unpaid / never completed). This is
 * intentionally separate from the live `user_entitlements` view, which only
 * surfaces *active* subscriptions and so drops these users back to "Free".
 */
export type FormerSubscription = {
  tier: SubscriptionTier;
  /** Raw Stripe status that classifies this as terminal. */
  status: string;
  /** When the subscription effectively ended (period end, else last update). */
  endedAt: string | null;
  /** Stripe self-serve cancellation feedback, e.g. "too_expensive". */
  reason: string | null;
};

/** Minimal shape of a `subscriptions` row needed to classify churn. */
export type FormerSubscriptionRow = {
  user_id: string | null;
  tier: string | null;
  status: string | null;
  current_period_end: string | null;
  updated_at: string | null;
  stripe_cancellation_feedback: string | null;
};

/**
 * Terminal Stripe statuses — a subscription in one of these is no longer
 * granting entitlement. Mirrors the inverse of the active set
 * (`active`, `trialing`, `past_due`) used by the user_entitlements view.
 */
const TERMINAL_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
  "unpaid",
]);

export function isTerminalSubscriptionStatus(status: string | null): boolean {
  return status != null && TERMINAL_STATUSES.has(status);
}

/**
 * Build a userId → most-recent lapsed subscription map from raw rows.
 *
 * - Only terminal-status rows count (active/trialing/past_due are *current*,
 *   not former, and are ignored).
 * - When a user has several lapsed subscriptions, the one that ended latest
 *   wins; rows with no end date sort last.
 */
export function buildFormerSubscriptionMap(
  rows: FormerSubscriptionRow[],
): Map<string, FormerSubscription> {
  const out = new Map<string, FormerSubscription>();
  for (const r of rows) {
    if (!r.user_id || !isTerminalSubscriptionStatus(r.status)) continue;
    const candidate: FormerSubscription = {
      tier: (r.tier as SubscriptionTier) ?? "coach",
      status: r.status as string,
      endedAt: r.current_period_end ?? r.updated_at ?? null,
      reason: r.stripe_cancellation_feedback ?? null,
    };
    const prev = out.get(r.user_id);
    if (!prev || (candidate.endedAt ?? "") > (prev.endedAt ?? "")) {
      out.set(r.user_id, candidate);
    }
  }
  return out;
}
