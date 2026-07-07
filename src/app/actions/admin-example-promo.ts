"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getExamplePromoMode,
  setExamplePromoMode,
  type ExamplePromoMode,
} from "@/lib/site/example-promo-config";

export async function getExamplePromoModeAction(): Promise<{
  ok: true;
  mode: ExamplePromoMode;
}> {
  if (!hasSupabaseEnv()) return { ok: true as const, mode: "off" };
  return { ok: true as const, mode: await getExamplePromoMode() };
}

export async function setExamplePromoModeAction(
  mode: ExamplePromoMode,
): Promise<{ ok: true; mode: ExamplePromoMode } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (mode !== "off" && mode !== "ab" && mode !== "everyone") {
    return { ok: false as const, error: "Invalid mode." };
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
    await setExamplePromoMode(mode);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
  revalidatePath("/home");
  return { ok: true as const, mode };
}
