import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export async function getMobileEditingEnabled(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("mobile_editing_enabled")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return false;
    if (!data) return false;
    return data.mobile_editing_enabled === true;
  } catch {
    return false;
  }
}

export async function setMobileEditingEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, mobile_editing_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
