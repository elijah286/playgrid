import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export function previewMaxMindKey(key: string | null | undefined): {
  configured: boolean;
  label: string;
} {
  const t = (key ?? "").trim();
  if (!t) return { configured: false, label: "No license key is saved yet." };
  const tail = t.length >= 4 ? t.slice(-4) : "••••";
  return { configured: true, label: `License key saved (ends with …${tail}).` };
}

export async function getStoredMaxMindLicenseKey(): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("site_settings")
    .select("maxmind_license_key")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const v = data?.maxmind_license_key;
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

export async function getMaxMindDownloadedAt(): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("site_settings")
    .select("maxmind_db_downloaded_at")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  return (data?.maxmind_db_downloaded_at as string | null) ?? null;
}

export async function setMaxMindDownloadedAt(iso: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin
    .from("site_settings")
    .update({ maxmind_db_downloaded_at: iso, updated_at: iso })
    .eq("id", SITE_ROW_ID);
}
