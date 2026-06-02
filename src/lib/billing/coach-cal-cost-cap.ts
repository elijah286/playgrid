import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCoachCalPackConfig } from "@/lib/site/coach-cal-pack-config";

// ─── Limits ────────────────────────────────────────────────────────────────
//
// Cost-based Coach Cal rate limit. Three windows bound runaway spend at
// different timescales, all measured in micro-USD (1e-6 USD) against the
// per-turn rows in coach_ai_token_usage:
//
//   - month: the real ceiling. Keeps a $9 paid coach under ~$5/mo of API
//     spend so the tier stays margin-positive.
//   - day (rolling 24h) + burst (rolling 5h): abuse guards, NOT the real
//     budget. They exist only to stop an overnight-loop / scripted-abuse
//     pattern from burning the whole month in an hour — the month cap is
//     what enforces the $5/user target.
//
// Sizing (calibrated 2026-06-02 against real usage): a Cal turn that hits
// the prompt cache costs ~$0.012; a cold-cache turn (75k-token prefix
// re-written after the 5-min cache TTL lapses) costs ~$0.095. A single
// multi-tool query fans out to ~6-9 API calls (one cold write + warm
// reads) ≈ $0.10-0.15. A heavy-but-legit 30-turn sitting runs ~$0.75.
// The old burst=$0.20 tripped after ~2 cold queries — i.e. it bound on
// normal use and made the meter read ~100% almost immediately, which is
// the false alarm we're fixing. burst/day are now set comfortably above a
// heavy honest session but well under the month cap, so they only catch
// true runaway loops.
//
// Tune these as real usage data accumulates (Site Admin → Cal usage).
export const COACH_CAL_COST_LIMITS = {
  monthMicros: 5_000_000, // $5.00 / calendar month — the real ceiling
  dayMicros: 2_500_000, //   $2.50 / rolling 24h  — abuse guard
  burstMicros: 1_000_000, // $1.00 / rolling 5h   — abuse guard
} as const;

// One message pack grants this much extra monthly cost budget. The pack's
// *price* is whatever Stripe price the admin configured; this is the
// budget the buyer receives. $2 of budget for a >$2 pack price keeps the
// top-up margin-positive.
export const COACH_CAL_PACK_BUDGET_MICROS = 2_000_000; // $2.00

const DAY_MS = 24 * 60 * 60 * 1000;
const BURST_MS = 5 * 60 * 60 * 1000;

// Below this fraction of every window, the user-facing meter stays hidden
// (admins always see it). Matches the Claude.ai "don't show until close"
// model the product owner asked for.
export const COACH_CAL_METER_VISIBLE_RATIO = 0.75;

export type CostWindowKey = "burst" | "day" | "month";

export type CostWindow = {
  usedMicros: number;
  limitMicros: number;
  /** 0..1 (can exceed 1 when over). */
  ratio: number;
  exceeded: boolean;
  /** ISO timestamp when this window drops back under its limit. For the
   *  monthly window, the first of next month. For rolling windows, the
   *  moment enough old spend ages out. null when the window isn't
   *  currently exceeded. */
  resetAt: string | null;
};

export type CoachCalCostState = {
  burst: CostWindow;
  day: CostWindow;
  month: CostWindow;
  /** True when ANY window is over its limit. */
  exceeded: boolean;
  /** The binding constraint: when exceeded, the over-limit window with the
   *  soonest reset; otherwise the window closest to its limit. Drives the
   *  meter label and the block message. */
  binding: CostWindowKey;
  /** Highest window ratio ×100, rounded. Drives meter visibility. */
  nearestPercent: number;
  /** Pack details for the buy CTA (monthly window only). */
  pack: { budgetMicros: number; priceUsdCents: number; priceConfigured: boolean };
  isAdmin: boolean;
  /** False for admins — the gate must NOT block them. */
  enforced: boolean;
};

type UsageRow = { occurredAtMs: number; costMicros: number };

/**
 * Compute when a rolling window drops back under its limit. Old spend ages
 * out oldest-first; we need just enough of the oldest rows to leave the
 * window to bring `used` back under `limit`. Returns the ISO time that
 * happens, or null if not currently over.
 *
 * Exported for tests.
 */
export function computeRollingReset(
  rows: UsageRow[],
  windowMs: number,
  limitMicros: number,
  nowMs: number,
): string | null {
  const inWindow = rows
    .filter((r) => r.occurredAtMs >= nowMs - windowMs)
    .sort((a, b) => a.occurredAtMs - b.occurredAtMs); // oldest first
  const used = inWindow.reduce((s, r) => s + r.costMicros, 0);
  const over = used - limitMicros;
  if (over <= 0) return null;
  // Age out oldest rows until the cumulative aged-out amount covers `over`.
  // The row that crosses that threshold leaves the window at
  // occurredAt + windowMs — that's when `used` first dips under `limit`.
  let aged = 0;
  for (const r of inWindow) {
    aged += r.costMicros;
    if (aged >= over) {
      return new Date(r.occurredAtMs + windowMs).toISOString();
    }
  }
  // Shouldn't happen (aging out everything clears the window), but be safe.
  return new Date(nowMs + windowMs).toISOString();
}

function makeWindow(
  rows: UsageRow[],
  windowMs: number | null,
  limitMicros: number,
  nowMs: number,
  monthResetIso: string,
): CostWindow {
  const used =
    windowMs === null
      ? rows.reduce((s, r) => s + r.costMicros, 0)
      : rows
          .filter((r) => r.occurredAtMs >= nowMs - windowMs)
          .reduce((s, r) => s + r.costMicros, 0);
  const exceeded = used >= limitMicros;
  const resetAt = !exceeded
    ? null
    : windowMs === null
      ? monthResetIso
      : computeRollingReset(rows, windowMs, limitMicros, nowMs);
  return {
    usedMicros: used,
    limitMicros,
    ratio: limitMicros > 0 ? used / limitMicros : 0,
    exceeded,
    resetAt,
  };
}

/**
 * Single source of truth for "is this user over a Coach Cal cost limit
 * right now, and how close are they". Used by the stream gate (enforce)
 * and the meter action (display).
 *
 * Admins get the full computed state but enforced=false — the gate is
 * required to let them blow past every limit.
 */
export async function getCoachCalCostState(
  userId: string,
  isAdmin: boolean,
): Promise<CoachCalCostState> {
  const now = new Date();
  const nowMs = now.getTime();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartIso = monthStart.toISOString();
  const monthStr = monthStartIso.slice(0, 10);
  const monthResetIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();

  const admin = createServiceRoleClient();
  const [usageRes, grantRes, pack, priceIdRes] = await Promise.all([
    // All rows this calendar month. Covers the month window directly and the
    // rolling 24h/5h windows (which are subsets). Bounded: at $5/mo and
    // single-digit-cent turns this is a few hundred rows worst case.
    admin
      .from("coach_ai_token_usage")
      .select("occurred_at, cost_micros")
      .eq("user_id", userId)
      .gte("occurred_at", monthStartIso),
    admin
      .from("owner_seat_grants")
      .select("purchased_budget_micros, purchased_budget_month")
      .eq("owner_id", userId)
      .maybeSingle(),
    getCoachCalPackConfig(),
    admin
      .from("site_settings")
      .select("stripe_price_coach_cal_pack")
      .eq("id", "default")
      .maybeSingle(),
  ]);
  const priceConfigured = Boolean(
    (priceIdRes.data as { stripe_price_coach_cal_pack?: string | null } | null)
      ?.stripe_price_coach_cal_pack,
  );

  const rows: UsageRow[] = (usageRes.data ?? []).map((r) => ({
    occurredAtMs: new Date(r.occurred_at as string).getTime(),
    costMicros: Number(r.cost_micros ?? 0),
  }));

  const purchasedMonth =
    (grantRes.data?.purchased_budget_month as string | null) ?? null;
  const purchasedBudget =
    purchasedMonth === monthStr
      ? Number(grantRes.data?.purchased_budget_micros ?? 0)
      : 0;

  const monthLimit = COACH_CAL_COST_LIMITS.monthMicros + purchasedBudget;

  const burst = makeWindow(rows, BURST_MS, COACH_CAL_COST_LIMITS.burstMicros, nowMs, monthResetIso);
  const day = makeWindow(rows, DAY_MS, COACH_CAL_COST_LIMITS.dayMicros, nowMs, monthResetIso);
  const month = makeWindow(rows, null, monthLimit, nowMs, monthResetIso);

  const windows: Record<CostWindowKey, CostWindow> = { burst, day, month };
  const exceeded = burst.exceeded || day.exceeded || month.exceeded;

  // Binding window: among exceeded windows, the one that frees up soonest
  // (so the block message quotes the shortest honest wait). If none are
  // exceeded, the window closest to its limit (drives the meter label).
  let binding: CostWindowKey;
  const exceededKeys = (Object.keys(windows) as CostWindowKey[]).filter(
    (k) => windows[k].exceeded,
  );
  if (exceededKeys.length > 0) {
    binding = exceededKeys.reduce((best, k) => {
      const a = windows[k].resetAt ?? "";
      const b = windows[best].resetAt ?? "";
      return a < b ? k : best;
    }, exceededKeys[0]);
  } else {
    binding = (Object.keys(windows) as CostWindowKey[]).reduce((best, k) =>
      windows[k].ratio > windows[best].ratio ? k : best,
    "burst");
  }

  const nearestPercent = Math.round(
    Math.max(burst.ratio, day.ratio, month.ratio) * 100,
  );

  return {
    burst,
    day,
    month,
    exceeded,
    binding,
    nearestPercent,
    pack: {
      budgetMicros: COACH_CAL_PACK_BUDGET_MICROS,
      priceUsdCents: pack.priceUsdCents,
      priceConfigured,
    },
    isAdmin,
    enforced: !isAdmin,
  };
}
