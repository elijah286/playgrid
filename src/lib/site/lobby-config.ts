import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export async function getHideLobbyAnimation(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("hide_lobby_playbook_animation")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return false;
    if (!data) return false;
    return data.hide_lobby_playbook_animation === true;
  } catch {
    return false;
  }
}

export async function setHideLobbyAnimation(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, hide_lobby_playbook_animation: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
