"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

/**
 * Mark the referral announcement seen (fires once) and stamp the shared
 * engagement cooldown so a review nudge won't immediately follow. Called by the
 * announcement nudge the moment it renders.
 */
export async function markReferralAnnouncementSeenAction(): Promise<void> {
  if (!hasSupabaseEnv()) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const admin = createServiceRoleClient();
    const nowIso = new Date().toISOString();
    await admin
      .from("profiles")
      .update({
        referral_announcement_seen_at: nowIso,
        last_engagement_prompt_at: nowIso,
      })
      .eq("id", user.id);
  } catch {
    /* best-effort */
  }
}
