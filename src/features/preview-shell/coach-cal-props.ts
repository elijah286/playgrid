import { getCachedCalDebugAccess } from "@/lib/auth/profile-cache";
import {
  getCurrentEntitlement,
  hasUsedCoachProTrial,
  type SubscriptionTier,
} from "@/lib/billing/entitlement";
import { canUseAiFeatures } from "@/lib/billing/features";
import { getCoachCalFreePromptState } from "@/lib/billing/coach-cal-free-prompts";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

export type ShellCoachCalProps = {
  isAdmin: boolean;
  canDebugCal: boolean;
  entitled: boolean;
  evalDays: number;
  imageUploadAvailable: boolean;
  userTier: SubscriptionTier | null;
  coachProTrialUsed: boolean;
};

/**
 * Compute the props the shared CoachAiLauncher needs — a faithful copy of
 * SiteHeader's server-side computation. The shell mounts its OWN launcher
 * because the production SiteHeader (which owns the global one) is unmounted on
 * /app. All reads here are cached, so the cost mirrors the production header.
 */
export async function getShellCoachCalProps(
  userId: string,
  isAdmin: boolean,
): Promise<ShellCoachCalProps> {
  const evalDays = await getCoachAiEvalDays();

  let canDebugCal = isAdmin;
  try {
    canDebugCal = isAdmin || (await getCachedCalDebugAccess(userId));
  } catch {
    /* best effort */
  }

  let entitled = false;
  let imageUploadAvailable = false;
  let coachProTrialUsed = false;
  let userTier: SubscriptionTier | null = null;

  try {
    const entitlement = await getCurrentEntitlement();
    userTier = entitlement?.tier ?? "free";
    const isEntitled = isAdmin || canUseAiFeatures(entitlement);

    // Free users get a small allowance of real Cal prompts before the paywall;
    // while they have some left, the launcher opens the real chat.
    let hasFreeCalPrompts = false;
    if (!isEntitled) {
      try {
        hasFreeCalPrompts = (await getCoachCalFreePromptState(userId)).hasRemaining;
      } catch {
        /* best effort — fall back to promo launcher */
      }
    }
    entitled = isEntitled || hasFreeCalPrompts;

    if (!isEntitled && userTier !== "coach") {
      coachProTrialUsed = await hasUsedCoachProTrial(userId);
    }

    try {
      const beta = await getBetaFeatures();
      // Match SiteHeader: gate on the broader `entitled` (includes free-prompt
      // users), not raw isEntitled, so the upload affordance is consistent
      // across the two surfaces.
      imageUploadAvailable = isBetaFeatureAvailable(beta.coach_ai_image_upload, {
        isAdmin,
        isEntitled: entitled,
      });
    } catch {
      /* best effort */
    }
  } catch {
    /* best effort */
  }

  return {
    isAdmin,
    canDebugCal,
    entitled,
    evalDays,
    imageUploadAvailable,
    userTier,
    coachProTrialUsed,
  };
}
