import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCoachCalPackConfig } from "@/lib/site/coach-cal-pack-config";

/** Tier-default monthly Coach Cal cap. Single source of truth shared
 *  by the user-facing usage action and the server-side stream gate. */
export const COACH_AI_MONTHLY_LIMIT = 200;

export type CoachCalCapState = {
  count: number;
  /** Effective monthly limit = base + bonus_messages + purchased_messages
   *  (the last only counts when purchased_messages_month == this month). */
  limit: number;
  remaining: number;
  exceeded: boolean;
  /** First day of next month (YYYY-MM-DD UTC). What the meter calls
   *  "reset". */
  resetDate: string;
  /** Pack details for the buy CTA. */
  pack: { messageCount: number; priceUsdCents: number; priceConfigured: boolean };
};

/** Single source of truth for "is this user out of Coach Cal messages
 *  right now". Used by the stream route to hard-block when over cap and
 *  to drive the structured error payload the client renders. */
export async function getCoachCalCapState(userId: string): Promise<CoachCalCapState> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStr = monthStart.toISOString().slice(0, 10);
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const resetDate = nextMonth.toISOString().slice(0, 10);

  const admin = createServiceRoleClient();
  const [usageRes, grantRes, pack, priceIdRes] = await Promise.all([
    admin
      .from("coach_ai_usage")
      .select("message_count")
      .eq("user_id", userId)
      .eq("month", monthStr)
      .maybeSingle(),
    admin
      .from("owner_seat_grants")
      .select("bonus_messages, purchased_messages, purchased_messages_month")
      .eq("owner_id", userId)
      .maybeSingle(),
    getCoachCalPackConfig(),
    admin
      .from("site_settings")
      .select("stripe_price_coach_cal_pack")
      .eq("id", "default")
      .maybeSingle(),
  ]);

  const count = (usageRes.data?.message_count as number | null) ?? 0;
  const bonus = (grantRes.data?.bonus_messages as number | null) ?? 0;
  const purchasedMonth = (grantRes.data?.purchased_messages_month as string | null) ?? null;
  const purchased =
    purchasedMonth === monthStr
      ? ((grantRes.data?.purchased_messages as number | null) ?? 0)
      : 0;

  const limit = COACH_AI_MONTHLY_LIMIT + bonus + purchased;
  const remaining = Math.max(0, limit - count);
  const priceConfigured = Boolean(
    (priceIdRes.data as { stripe_price_coach_cal_pack?: string | null } | null)
      ?.stripe_price_coach_cal_pack,
  );

  return {
    count,
    limit,
    remaining,
    exceeded: count >= limit,
    resetDate,
    pack: { ...pack, priceConfigured },
  };
}
