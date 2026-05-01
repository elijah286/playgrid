"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getAnalyticsExcludedEmails,
  setAnalyticsExcludedEmails,
} from "@/lib/site/analytics-exclusions-config";

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

export async function getAnalyticsExcludedEmailsAction(): Promise<
  { ok: true; emails: string[] } | { ok: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    const emails = await getAnalyticsExcludedEmails();
    return { ok: true, emails };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load." };
  }
}

export async function setAnalyticsExcludedEmailsAction(
  emails: string[],
): Promise<{ ok: true; emails: string[] } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    const saved = await setAnalyticsExcludedEmails(emails);
    revalidatePath("/settings");
    return { ok: true, emails: saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

export async function toggleAnalyticsExclusionAction(
  email: string,
): Promise<{ ok: true; emails: string[] } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    const current = await getAnalyticsExcludedEmails();
    const normalized = email.trim().toLowerCase();
    let next: string[];
    if (current.includes(normalized)) {
      // Remove it
      next = current.filter((e) => e !== normalized);
    } else {
      // Add it
      next = [...current, normalized];
    }
    const saved = await setAnalyticsExcludedEmails(next);
    revalidatePath("/settings");
    return { ok: true, emails: saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Toggle failed." };
  }
}
