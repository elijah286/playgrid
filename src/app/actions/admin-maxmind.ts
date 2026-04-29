"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getMaxMindDownloadedAt,
  previewMaxMindKey,
} from "@/lib/site/maxmind-key";
import { refreshMaxMindDb } from "@/lib/geo/maxmind";

const SITE_ROW_ID = "default";

async function assertAdmin() {
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
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const };
}

export type MaxMindStatus = {
  ok: true;
  configured: boolean;
  statusLabel: string;
  downloadedAt: string | null;
};

export async function getMaxMindStatusAction(): Promise<
  MaxMindStatus | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("maxmind_license_key, maxmind_db_downloaded_at")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const { configured, label } = previewMaxMindKey(data?.maxmind_license_key);
    return {
      ok: true,
      configured,
      statusLabel: label,
      downloadedAt: (data?.maxmind_db_downloaded_at as string | null) ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load settings.";
    return { ok: false, error: msg };
  }
}

export async function saveMaxMindLicenseKeyAction(rawKey: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const key = rawKey.trim();
  if (!key) {
    return {
      ok: false as const,
      error: "Paste a license key before saving, or use Remove saved key.",
    };
  }
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        maxmind_license_key: key,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return { ok: false as const, error: msg };
  }
}

export async function clearMaxMindLicenseKeyAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        maxmind_license_key: null,
        maxmind_db_downloaded_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not remove key.";
    return { ok: false as const, error: msg };
  }
}

export async function refreshMaxMindDbAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const res = await refreshMaxMindDb();
  if (!res.ok) return { ok: false as const, error: res.error ?? "Refresh failed." };
  const downloadedAt = await getMaxMindDownloadedAt();
  revalidatePath("/settings");
  return { ok: true as const, downloadedAt };
}
