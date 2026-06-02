"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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

/**
 * Zero out the calling admin's Coach Cal usage meters by deleting their
 * token-usage rows for the current calendar month. The three windows
 * (burst / day / month) are all computed from these rows, so clearing the
 * month clears all three. Admin-only — a non-admin caller is rejected.
 *
 * This is a calibration tool for the product owner (the meters can hit
 * 100% fast on a few queries while we tune the caps); it does not touch
 * any other user's data and does not change the limits themselves.
 */
export async function resetCoachCalUsageAction(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";
  if (!isAdmin) return { ok: false };

  const now = new Date();
  const monthStartIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("coach_ai_token_usage")
    .delete()
    .eq("user_id", user.id)
    .gte("occurred_at", monthStartIso);

  return { ok: !error };
}
