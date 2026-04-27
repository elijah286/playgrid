import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-free-plays";

/** Hardcoded fallback if site_settings is unreachable. Keep in sync with the
 *  migration default so on-call behavior matches the advertised cap. */
export const FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT = 16;

const fetchFreeMaxPlays = unstable_cache(
  async (): Promise<number> => {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("site_settings")
        .select("free_max_plays_per_playbook")
        .eq("id", SITE_ROW_ID)
        .maybeSingle();
      if (error || !data) return FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT;
      const n = data.free_max_plays_per_playbook as number | null;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 1) {
        return FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT;
      }
      return Math.floor(n);
    } catch {
      return FREE_MAX_PLAYS_PER_PLAYBOOK_DEFAULT;
    }
  },
  [CACHE_TAG],
  { tags: [CACHE_TAG], revalidate: 60 },
);

export async function getFreeMaxPlaysPerPlaybook(): Promise<number> {
  return fetchFreeMaxPlays();
}

export async function setFreeMaxPlaysPerPlaybook(next: number): Promise<void> {
  if (!Number.isFinite(next) || next < 1 || next > 1000) {
    throw new Error("Play cap must be between 1 and 1000.");
  }
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, free_max_plays_per_playbook: Math.floor(next) },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
