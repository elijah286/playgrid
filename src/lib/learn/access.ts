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

export async function isFootballLibraryAvailable(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const features = await getBetaFeatures();
  const scope = features.football_library;
  if (scope === "all") return true;
  if (scope === "off") return false;
  // "me" or "custom" need an auth lookup.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  let isAdmin = false;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = (profile?.role as string | null) === "admin";
  } catch {
    isAdmin = false;
  }
  return isBetaFeatureAvailable(scope, { isAdmin, isEntitled: true });
}
