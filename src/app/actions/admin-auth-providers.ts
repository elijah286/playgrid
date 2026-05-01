"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  setAppleSigninEnabled,
  setGoogleSigninEnabled,
} from "@/lib/site/auth-providers-config";

async function requireAdmin() {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
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
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const };
}

export async function setAppleSigninEnabledAction(enabled: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    await setAppleSigninEnabled(enabled);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }
  revalidatePath("/login");
  return { ok: true as const, enabled };
}

export async function setGoogleSigninEnabledAction(enabled: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    await setGoogleSigninEnabled(enabled);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }
  revalidatePath("/login");
  return { ok: true as const, enabled };
}
