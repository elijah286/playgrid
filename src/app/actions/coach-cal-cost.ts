"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getCoachCalCostState,
  type CoachCalCostState,
} from "@/lib/billing/coach-cal-cost-cap";

/**
 * Cost-based Coach Cal usage state for the in-chat meter. Returns null
 * when signed out. The meter component decides visibility (admins always
 * see it; coaches only when near a limit) — the action always returns the
 * full state so admins can inspect it.
 */
export async function getCoachCalCostStateAction(): Promise<CoachCalCostState | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  return getCoachCalCostState(user.id, isAdmin);
}
