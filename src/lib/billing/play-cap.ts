import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlaybookOwnerEntitlement } from "@/lib/billing/owner-entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";

export async function assertPlayCap(
  supabase: SupabaseClient,
  playbookId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerEnt = await getPlaybookOwnerEntitlement(playbookId);
  if (tierAtLeast(ownerEnt, "coach")) return { ok: true };
  const limit = await getFreeMaxPlaysPerPlaybook();
  const { count } = await supabase
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId)
    .eq("is_archived", false)
    .is("attached_to_play_id", null)
    .is("deleted_at", null);
  if ((count ?? 0) >= limit) {
    return {
      ok: false,
      error: `Free tier is capped at ${limit} plays per playbook. Upgrade to Team Coach for unlimited plays.`,
    };
  }
  return { ok: true };
}
