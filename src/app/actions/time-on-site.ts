"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export async function recordTimeOnSiteAction(
  deltaSeconds: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { ok: false, error: "Invalid delta." };
  }
  const delta = Math.min(600, Math.floor(deltaSeconds));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.rpc("increment_time_on_site", { p_delta: delta });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
