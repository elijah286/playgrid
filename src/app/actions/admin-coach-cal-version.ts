"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getCoachCalVersion,
  setCoachCalVersion,
  type CoachCalVersion,
} from "@/lib/site/coach-cal-version";

export async function getCoachCalVersionAction() {
  if (!hasSupabaseEnv()) return { ok: true as const, version: "v2" as CoachCalVersion };
  const version = await getCoachCalVersion();
  return { ok: true as const, version };
}

export async function setCoachCalVersionAction(version: CoachCalVersion) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (version !== "v1" && version !== "v2") {
    return { ok: false as const, error: `Invalid version: ${version}` };
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
    await setCoachCalVersion(version);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }

  // Revalidate so the admin page reflects the new value AND so any
  // /admin/site-settings caches that show the toggle reload.
  revalidatePath("/", "layout");
  return { ok: true as const, version };
}
