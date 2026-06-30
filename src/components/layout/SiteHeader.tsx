import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
import { SiteHeaderShell } from "@/components/layout/SiteHeaderShell";
import { getCurrentEntitlement, hasUsedCoachProTrial, type SubscriptionTier } from "@/lib/billing/entitlement";
import { canUseAiFeatures } from "@/lib/billing/features";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { getFeedbackWidgetSettings } from "@/lib/site/feedback-config";
import { hasLeagueAccess } from "@/lib/league/access";

export async function SiteHeader() {
  let user: { id: string; email: string | null } | null = null;
  let isAdmin = false;
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let coachAiAvailable = false;
  let showCoachCalPromo = false; // logged-in user without Coach Pro sees the CTA
  let coachAiImageUploadAvailable = false;
  let userTier: SubscriptionTier | null = null;
  let coachProTrialUsed = false;
  let leagueAccess = false; // league organizer → Resources gets a League Operations link
  // Independent config reads — fetch in parallel so the header doesn't pay
  // three sequential round-trips before it can render.
  const [coachAiEvalDays, footballLibraryAvailable, feedbackSettings] =
    await Promise.all([
      getCoachAiEvalDays(),
      isFootballLibraryAvailable(),
      getFeedbackWidgetSettings(),
    ]);
  const feedbackEnabled = feedbackSettings.enabled;

  if (hasSupabaseEnv()) {
    try {
      const authResult = await getRequestUser();
      const authUser = authResult.kind === "ok" ? authResult.user : null;
      if (authUser) {
        user = { id: authUser.id, email: authUser.email ?? null };
        const role = await getCachedUserRole(authUser.id);
        isAdmin = role === "admin";
        try {
          const admin = createServiceRoleClient();
          const { data } = await admin
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", authUser.id)
            .maybeSingle();
          displayName = (data?.display_name as string | null) ?? null;
          avatarUrl = (data?.avatar_url as string | null) ?? null;
        } catch {
          /* best effort */
        }
        try {
          const entitlement = await getCurrentEntitlement();
          userTier = entitlement?.tier ?? "free";
          const isEntitled = isAdmin || canUseAiFeatures(entitlement);
          coachAiAvailable = isEntitled;
          // Logged-in users without a Team Coach subscription see the promo
          // launcher (upgrade CTA) instead of the chat.
          showCoachCalPromo = !coachAiAvailable;
          // Trial gate retained for legacy preview surfaces — the Cal-folded
          // Team Coach tier has no trial today, so this only matters if we
          // relaunch a trialed SKU later. Skip for entitled users.
          if (!isEntitled && userTier !== "coach") {
            coachProTrialUsed = await hasUsedCoachProTrial(authUser.id);
          }
        } catch {
          /* best effort */
        }
        // Photo/file upload in Coach Cal — gated behind a beta flag
        // while the hand-drawn play-sheet vision pipeline is still
        // unreliable. Default scope is "off"; site admin sets "me"
        // for site-admin-only testing in production.
        try {
          const betaFeatures = await getBetaFeatures();
          coachAiImageUploadAvailable = isBetaFeatureAvailable(
            betaFeatures.coach_ai_image_upload,
            { isAdmin, isEntitled: coachAiAvailable },
          );
        } catch {
          /* best effort */
        }
        try {
          leagueAccess = await hasLeagueAccess();
        } catch {
          /* best effort — non-organizers just don't see the link */
        }
      }
    } catch {
      /* unauthenticated — render anonymous header */
    }
  }

  return (
    <SiteHeaderShell
      user={user}
      isAdmin={isAdmin}
      displayName={displayName}
      avatarUrl={avatarUrl}
      coachAiAvailable={coachAiAvailable}
      showCoachCalPromo={showCoachCalPromo}
      coachAiEvalDays={coachAiEvalDays}
      coachAiImageUploadAvailable={coachAiImageUploadAvailable}
      userTier={userTier}
      coachProTrialUsed={coachProTrialUsed}
      footballLibraryAvailable={footballLibraryAvailable}
      leagueAccess={leagueAccess}
      feedbackEnabled={feedbackEnabled}
    />
  );
}
