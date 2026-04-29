"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  type ReferralConfig,
  getReferralConfig,
  setReferralConfig,
} from "@/lib/site/referral-config";

export async function getReferralConfigAction() {
  if (!hasSupabaseEnv()) {
    return {
      ok: true as const,
      config: { enabled: false, daysPerAward: 30, capDays: null } satisfies ReferralConfig,
    };
  }
  const config = await getReferralConfig();
  return { ok: true as const, config };
}

export async function setReferralConfigAction(next: ReferralConfig) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }

  try {
    await setReferralConfig(next);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true as const, config: next };
}
