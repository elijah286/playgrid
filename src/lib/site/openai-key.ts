import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export function previewOpenAIKey(key: string | null | undefined): {
  configured: boolean;
  label: string;
} {
  const t = (key ?? "").trim();
  if (!t) {
    return { configured: false, label: "No API key is saved yet." };
  }
  const tail = t.length >= 4 ? t.slice(-4) : "••••";
  return {
    configured: true,
    label: `A key is saved (ends with …${tail}).`,
  };
}

/** Server-only: returns trimmed secret or null. */
export async function getStoredOpenAIApiKey(): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("site_settings")
    .select("openai_api_key")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const v = data?.openai_api_key;
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}
