import { createServiceRoleClient } from "@/lib/supabase/admin";
import { FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT } from "@/lib/billing/features";

const SITE_ROW_ID = "default";

export async function getFreeMaxPlaysPerPlaybook(): Promise<number> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("free_max_plays_per_playbook")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT;
    const raw = data.free_max_plays_per_playbook;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      return FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT;
    }
    return Math.floor(raw);
  } catch {
    return FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT;
  }
}

export async function setFreeMaxPlaysPerPlaybook(next: number): Promise<void> {
  if (!Number.isFinite(next) || next <= 0) {
    throw new Error("Limit must be a positive integer.");
  }
  const value = Math.floor(next);
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, free_max_plays_per_playbook: value },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
