// Server-side gate for the Football Library beta feature. Every
// library URL, the Resources dropdown entry, the home-page teaser, and
// the sitemap entries all consult this helper. When the beta flag is
// "off" (or "me" + non-admin) the library is hidden — links disappear,
// URLs 404, sitemap drops the entries.

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

/** Whether the currently-signed-in user has the `admin` role on their
 *  `profiles` row. Returns false for anon, missing profile, or any
 *  error. Used to gate site-admin-only affordances (Edit-this-play
 *  link on library pages, beta-flag toggles, etc.).
 *
 *  Lives in learn/access.ts because the library page is the first
 *  surface that needs admin gating outside of the dashboard's own
 *  admin pages. If a second non-learn surface needs this, lift it to
 *  src/lib/auth/admin.ts. */
export async function isCurrentUserSiteAdmin(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return (profile?.role as string | null) === "admin";
  } catch {
    return false;
  }
}

export async function isFootballLibraryAvailable(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const features = await getBetaFeatures();
  const scope = features.football_library;
  if (scope === "all") return true;
  if (scope === "off") return false;
  // "me" or "custom" need an auth lookup.
  const isAdmin = await isCurrentUserSiteAdmin();
  return isBetaFeatureAvailable(scope, { isAdmin, isEntitled: true });
}
