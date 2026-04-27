"use server";

import { createClient } from "@/lib/supabase/server";
import type { CoachAiUsageInfo } from "@/features/coach-ai/types";

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

  const [usageRes, subRes] = await Promise.all([
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
  ]);

  return {
    count: (usageRes.data?.message_count as number | null) ?? 0,
    limit: COACH_AI_MONTHLY_LIMIT,
    resetDate,
    periodEnd: (subRes.data?.current_period_end as string | null) ?? null,
  };
}
