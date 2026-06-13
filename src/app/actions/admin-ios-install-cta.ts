"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getIosInstallCtaConfig,
  setIosInstallCtaEnabled,
  setIosAppStoreId,
} from "@/lib/site/ios-install-cta-config";

/**
 * Public read for the iOS install-CTA gate. Called CLIENT-SIDE by
 * AppInstallBanner on mount (only for a non-dismissed iOS visitor), never in
 * the root layout — so it can't perturb static generation. Not admin-gated:
 * whether the iOS app is live and its App Store ID are public the moment the
 * banner would link to the store. Always returns ok; the banner stays hidden
 * on anything falsy.
 */
export async function getIosInstallCtaConfigAction() {
  if (!hasSupabaseEnv()) {
    return { ok: true as const, enabled: false, appStoreId: null as string | null };
  }
  try {
    const cfg = await getIosInstallCtaConfig();
    return {
      ok: true as const,
      enabled: cfg.enabled,
      appStoreId: cfg.appStoreId,
    };
  } catch {
    return { ok: true as const, enabled: false, appStoreId: null as string | null };
  }
}

/** Shared admin gate for the writes below. Mirrors the inline check used by
 *  the other site-settings actions (admin-mobile-editing, admin-lobby, …). */
async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Forbidden." };
  }
  return { ok: true };
}

export async function setIosInstallCtaEnabledAction(enabled: boolean) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const gate = await ensureAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  try {
    await setIosInstallCtaEnabled(enabled);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }

  // The banner reads this in the root layout, so refresh every route's shell.
  revalidatePath("/", "layout");
  return { ok: true as const, enabled };
}

export async function setIosAppStoreIdAction(rawId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const gate = await ensureAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  // App Store IDs are numeric. Normalize liberally so an admin can paste the
  // bare number, an "id6471234567" token, or a full apps.apple.com URL — we
  // keep only the digits. An empty input clears the ID (banner goes dark).
  const trimmed = rawId.trim();
  let normalized: string | null = null;
  if (trimmed.length > 0) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 0) {
      return {
        ok: false as const,
        error: "Enter the numeric App Store ID (e.g. 6471234567).",
      };
    }
    normalized = digits;
  }

  try {
    await setIosAppStoreId(normalized);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true as const, appStoreId: normalized };
}
