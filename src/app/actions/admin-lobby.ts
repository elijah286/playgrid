"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getHideLobbyAnimation,
  setHideLobbyAnimation,
} from "@/lib/site/lobby-config";

export async function getHideLobbyAnimationAction() {
  if (!hasSupabaseEnv()) return { ok: true as const, enabled: false };
  const enabled = await getHideLobbyAnimation();
  return { ok: true as const, enabled };
}

export async function setHideLobbyAnimationAction(enabled: boolean) {
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
    await setHideLobbyAnimation(enabled);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }

  revalidatePath("/", "layout");
  return { ok: true as const, enabled };
}
