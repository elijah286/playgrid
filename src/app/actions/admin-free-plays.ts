"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getFreeMaxPlaysPerPlaybook,
  setFreeMaxPlaysPerPlaybook,
} from "@/lib/site/free-plays-config";

export async function getFreeMaxPlaysPerPlaybookAction() {
  if (!hasSupabaseEnv()) return { ok: true as const, value: 16 };
  const value = await getFreeMaxPlaysPerPlaybook();
  return { ok: true as const, value };
}

export async function setFreeMaxPlaysPerPlaybookAction(value: number) {
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
    await setFreeMaxPlaysPerPlaybook(value);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }

  revalidatePath("/", "layout");
  return { ok: true as const, value: Math.floor(value) };
}
