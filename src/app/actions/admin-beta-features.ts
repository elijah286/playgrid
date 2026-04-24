"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  setBetaFeatureScope,
  type BetaFeatureKey,
  type BetaFeatureScope,
  type BetaFeatures,
} from "@/lib/site/beta-features-config";

const DEFAULTS: BetaFeatures = { coach_ai: "off", game_mode: "off", game_results: "off" };

export async function getBetaFeaturesAction() {
  if (!hasSupabaseEnv()) return { ok: true as const, features: { ...DEFAULTS } };
  const features = await getBetaFeatures();
  return { ok: true as const, features };
}

export async function setBetaFeatureScopeAction(
  feature: BetaFeatureKey,
  scope: BetaFeatureScope,
) {
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
    const features = await setBetaFeatureScope(feature, scope);
    revalidatePath("/", "layout");
    return { ok: true as const, features };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
}
