"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { CoachAiUsageInfo } from "@/features/coach-ai/types";

/** Tier-default monthly Coach Cal cap. Admins can grant additive
 *  per-user bonuses via owner_seat_grants.bonus_messages, which stack
 *  on top of this. */
const COACH_AI_MONTHLY_LIMIT = 200;

export async function getCoachAiUsageAction(): Promise<CoachAiUsageInfo> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // First day of this month (UTC)
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStr = monthStart.toISOString().slice(0, 10);

  // First day of next month
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const resetDate = nextMonth.toISOString().slice(0, 10);

  if (!user) {
    return { count: 0, limit: COACH_AI_MONTHLY_LIMIT, resetDate, periodEnd: null };
  }

  const admin = createServiceRoleClient();
  const [usageRes, subRes, grantRes] = await Promise.all([
    supabase
      .from("coach_ai_usage")
      .select("message_count")
      .eq("user_id", user.id)
      .eq("month", monthStr)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("current_period_end")
      .eq("owner_id", user.id)
      .in("status", ["active", "trialing"])
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("owner_seat_grants")
      .select("bonus_messages")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  const bonus = (grantRes.data?.bonus_messages as number | null) ?? 0;

  return {
    count: (usageRes.data?.message_count as number | null) ?? 0,
    limit: COACH_AI_MONTHLY_LIMIT + bonus,
    resetDate,
    periodEnd: (subRes.data?.current_period_end as string | null) ?? null,
  };
}
