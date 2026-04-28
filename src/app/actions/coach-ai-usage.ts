"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { COACH_AI_MONTHLY_LIMIT } from "@/lib/billing/coach-cal-cap";
import type { CoachAiUsageInfo } from "@/features/coach-ai/types";

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
      .select("bonus_messages, purchased_messages, purchased_messages_month")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  const bonus = (grantRes.data?.bonus_messages as number | null) ?? 0;
  const purchasedMonth = (grantRes.data?.purchased_messages_month as string | null) ?? null;
  const purchased =
    purchasedMonth === monthStr
      ? ((grantRes.data?.purchased_messages as number | null) ?? 0)
      : 0;

  return {
    count: (usageRes.data?.message_count as number | null) ?? 0,
    limit: COACH_AI_MONTHLY_LIMIT + bonus + purchased,
    resetDate,
    periodEnd: (subRes.data?.current_period_end as string | null) ?? null,
  };
}
