import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export async function getHideOwnerInfoAbout(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("hide_owner_info_about")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return false;
    return data?.hide_owner_info_about === true;
  } catch {
    return false;
  }
}

export async function setHideOwnerInfoAbout(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, hide_owner_info_about: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
