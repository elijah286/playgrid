/**
 * Gating for the photo play import feature.
 *
 * One decision function shared by the API routes and the import page:
 * signed-in user + `photo_play_import` beta scope (admin for "me",
 * entitled for "all", email allowlist for "custom") + the monthly image
 * cap. The cap is enforced for non-admins only, mirroring how the Cal
 * cost caps treat admins (visible but not binding) — admins are the
 * ones testing the feature in prod.
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { canUseAiFeatures } from "@/lib/billing/features";
import {
  getBetaFeatures,
  getBetaFeatureAllowlistEmails,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import {
  getCoachCalImageCapState,
  type CoachCalImageCapState,
} from "@/lib/billing/coach-cal-image-cap";

export type PhotoImportAccess =
  | { ok: true; userId: string; isAdmin: boolean; cap: CoachCalImageCapState }
  | { ok: false; status: 401 | 403; error: string };

export async function checkPhotoImportAccess(): Promise<PhotoImportAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = (profile?.role as string | null) === "admin";

  const features = await getBetaFeatures();
  const scope = features.photo_play_import;
  let isInAllowlist = false;
  if (scope === "custom" && user.email) {
    const emails = await getBetaFeatureAllowlistEmails("photo_play_import");
    const mine = user.email.toLowerCase();
    isInAllowlist = emails.some((e) => e.toLowerCase() === mine);
  }
  const entitlement = await getCurrentEntitlement();
  const isEntitled = isAdmin || canUseAiFeatures(entitlement);

  if (!isBetaFeatureAvailable(scope, { isAdmin, isEntitled, isInAllowlist })) {
    return {
      ok: false,
      status: 403,
      error: "Photo play import isn't enabled for your account.",
    };
  }

  const cap = await getCoachCalImageCapState(user.id);
  return { ok: true, userId: user.id, isAdmin, cap };
}

/** True when the (already-enforced) monthly cap should block this call. */
export function capBlocks(access: Extract<PhotoImportAccess, { ok: true }>): boolean {
  return access.cap.exceeded && !access.isAdmin;
}
