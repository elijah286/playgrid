"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getFreeMaxPlaysPerPlaybook,
  setFreeMaxPlaysPerPlaybook,
} from "@/lib/site/free-tier-config";
import { FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT } from "@/lib/billing/features";

export async function getFreeMaxPlaysPerPlaybookAction() {
  if (!hasSupabaseEnv()) {
    return { ok: true as const, limit: FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT };
  }
  const limit = await getFreeMaxPlaysPerPlaybook();
  return { ok: true as const, limit };
}

export async function setFreeMaxPlaysPerPlaybookAction(next: number) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!Number.isFinite(next) || next <= 0 || Math.floor(next) !== next) {
    return { ok: false as const, error: "Enter a positive whole number." };
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
    await setFreeMaxPlaysPerPlaybook(next);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }

  revalidatePath("/pricing");
  revalidatePath("/", "layout");
  return { ok: true as const, limit: next };
}
