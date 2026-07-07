import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketingVariant = "treatment" | "control" | "holdout";
export type MarketingStatus = "sent" | "failed" | "holdout" | "skipped";

/**
 * Deterministic, stable A/B arm for a (user, campaign). Salting by campaign key
 * means a coach who lands in the holdout for one campaign isn't automatically
 * held out of every campaign. Pure — same inputs always yield the same arm.
 */
export function abArm(userId: string, campaign: string): "treatment" | "holdout" {
  let h = 0x811c9dc5;
  const s = `${userId}|${campaign}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Avalanche finalizer: FNV's multiply never mixes into the low bit (odd prime
  // preserves parity), so taking `h & 1` straight off the loop degenerates into
  // a byte-parity check — the campaign salt then only works when two campaign
  // strings happen to differ in parity. This xorshift/multiply finalizer mixes
  // the high bits down so the arm truly depends on the whole (user, campaign).
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h & 1) === 0 ? "treatment" : "holdout";
}

/**
 * Record one marketing touch. Idempotent via the unique(user_id, campaign)
 * constraint — a duplicate returns false (already processed) rather than
 * throwing, so callers can treat the log as the "have we handled this user"
 * ledger. Service-role client required (RLS blocks writes otherwise).
 */
export async function recordMarketingSend(
  admin: SupabaseClient,
  row: {
    userId: string;
    campaign: string;
    variant: MarketingVariant;
    status: MarketingStatus;
    toEmail?: string | null;
    errorMessage?: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const { error } = await admin.from("marketing_email_sends").insert({
    user_id: row.userId,
    campaign: row.campaign,
    variant: row.variant,
    status: row.status,
    to_email: row.toEmail ?? null,
    error_message: row.errorMessage ?? null,
    meta: row.meta ?? null,
  });
  return !error;
}
