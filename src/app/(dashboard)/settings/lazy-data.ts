"use server";

/**
 * On-demand data loaders for the Site admin page's heavier tabs.
 *
 * The page's initial server render only fetches what the default Overview
 * tab and the nav badges need (see page.tsx). The tabs an admin opens
 * occasionally — Integrations, Site, Opex, Revenue, Cal usage, Playbook
 * seeds, Beta, and the Re-engagement analytics sub-tab — fetch their data
 * the first time they're opened, via these actions, and the client caches
 * the result for the session (see _components/lazyTab.tsx + ui.tsx).
 *
 * Each loader reproduces the exact prop mapping page.tsx used to do inline,
 * so the tab panels receive identical shapes. Every underlying action
 * re-checks admin on its own, so these are safe to invoke from the client.
 *
 * Note: this is a "use server" module, so it can only export async
 * functions. Tab-panel prop types are derived in the client via
 * `Awaited<ReturnType<typeof loader>>` rather than exported from here.
 */

import {
  getClaudeIntegrationStatusAction,
  getOpenAIIntegrationStatusAction,
  getAnthropicAdminKeyStatusAction,
  getOpenAIAdminKeyStatusAction,
} from "@/app/actions/admin-integrations";
import { getResendStatusAction } from "@/app/actions/admin-resend";
import { getGoogleMapsStatusAction } from "@/app/actions/admin-google-maps";
import { getMaxMindStatusAction } from "@/app/actions/admin-maxmind";
import { getRedditPixelStatusAction } from "@/app/actions/admin-reddit-pixel";
import { getMetaPixelStatusAction } from "@/app/actions/admin-meta-pixel";
import { getAuthProvidersConfig } from "@/lib/site/auth-providers-config";
import { getSeatDefaults } from "@/lib/site/seat-defaults-config";
import { getCoachCalPackConfig } from "@/lib/site/coach-cal-pack-config";
import { listCoachBonusGrantsAction } from "@/app/actions/admin-seat-config";
import { getHideLobbyAnimation } from "@/lib/site/lobby-config";
import { getExamplesPageEnabled } from "@/lib/site/examples-config";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { getMobileEditingEnabled } from "@/lib/site/mobile-editing-config";
import { getHideOwnerInfoAbout } from "@/lib/site/about-config";
import { getReferralConfig } from "@/lib/site/referral-config";
import { getCoachCalUpgradeBannerEnabled } from "@/lib/site/coach-cal-banner-config";
import { getCoachCalVersion } from "@/lib/site/coach-cal-version";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import { getCoachCalFreePromptAllowance } from "@/lib/site/coach-cal-free-prompts-config";
import { getSuggestReviews } from "@/lib/site/review-prompt-config";
import {
  listOpexServicesAction,
  listOpexEntriesAction,
} from "@/app/actions/admin-opex";
import { getRevenueBreakdownAction } from "@/app/actions/admin-billing";
import { listCoachAiTokenUsageAction } from "@/app/actions/coach-ai-token-usage";
import { listSeedFormationsAction } from "@/app/actions/formations";
import { getBetaFeatures } from "@/lib/site/beta-features-config";
import { getReengagementMetricsAction } from "@/app/actions/admin-reengagement";
import { getAppMetricsSummaryAction } from "@/app/actions/admin-app-metrics";
import { listFunctionalTestRunsAction } from "@/app/actions/admin-functional-tests";

function currentMonthYM(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

const NO_ADMIN_KEY = {
  configured: false,
  statusLabel: "No admin key is saved yet.",
};

/** Integrations tab — provider keys, email/maps/geo/pixel status, native sign-in. */
export async function loadIntegrationsTabData() {
  const [
    integrationRes,
    claudeRes,
    resendRes,
    googleMapsRes,
    maxmindRes,
    redditPixelRes,
    metaPixelRes,
    anthropicAdminKeyRes,
    openaiAdminKeyRes,
    authProviders,
  ] = await Promise.all([
    getOpenAIIntegrationStatusAction(),
    getClaudeIntegrationStatusAction(),
    getResendStatusAction(),
    getGoogleMapsStatusAction(),
    getMaxMindStatusAction(),
    getRedditPixelStatusAction(),
    getMetaPixelStatusAction(),
    getAnthropicAdminKeyStatusAction(),
    getOpenAIAdminKeyStatusAction(),
    getAuthProvidersConfig(),
  ]);

  return {
    integration: integrationRes.ok
      ? {
          ok: true as const,
          configured: integrationRes.configured,
          statusLabel: integrationRes.statusLabel,
          updatedAt: integrationRes.updatedAt,
        }
      : { ok: false as const, error: integrationRes.error },
    claude: claudeRes.ok
      ? {
          ok: true as const,
          configured: claudeRes.configured,
          statusLabel: claudeRes.statusLabel,
          provider: claudeRes.provider,
          updatedAt: claudeRes.updatedAt,
        }
      : { ok: false as const, error: claudeRes.error },
    resend: resendRes.ok
      ? {
          ok: true as const,
          configured: resendRes.configured,
          statusLabel: resendRes.statusLabel,
          fromEmail: resendRes.fromEmail,
          contactToEmail: resendRes.contactToEmail,
          updatedAt: resendRes.updatedAt,
        }
      : { ok: false as const, error: resendRes.error },
    googleMaps: googleMapsRes.ok
      ? {
          ok: true as const,
          configured: googleMapsRes.configured,
          statusLabel: googleMapsRes.statusLabel,
          updatedAt: googleMapsRes.updatedAt,
        }
      : { ok: false as const, error: googleMapsRes.error },
    maxmind: maxmindRes.ok
      ? {
          ok: true as const,
          configured: maxmindRes.configured,
          statusLabel: maxmindRes.statusLabel,
          downloadedAt: maxmindRes.downloadedAt,
        }
      : { ok: false as const, error: maxmindRes.error },
    redditPixel: redditPixelRes.ok
      ? {
          ok: true as const,
          configured: redditPixelRes.configured,
          statusLabel: redditPixelRes.statusLabel,
        }
      : { ok: false as const, error: redditPixelRes.error },
    metaPixel: metaPixelRes.ok
      ? {
          ok: true as const,
          configured: metaPixelRes.configured,
          statusLabel: metaPixelRes.statusLabel,
        }
      : { ok: false as const, error: metaPixelRes.error },
    anthropicAdminKey: anthropicAdminKeyRes.ok
      ? {
          configured: anthropicAdminKeyRes.configured,
          statusLabel: anthropicAdminKeyRes.statusLabel,
        }
      : NO_ADMIN_KEY,
    openaiAdminKey: openaiAdminKeyRes.ok
      ? {
          configured: openaiAdminKeyRes.configured,
          statusLabel: openaiAdminKeyRes.statusLabel,
        }
      : NO_ADMIN_KEY,
    googleOAuthWebClientId: authProviders.googleOAuthWebClientId,
    googleOAuthIosClientId: authProviders.googleOAuthIosClientId,
  };
}

/** Site tab — seat defaults/bonuses, Cal pack, and the site-settings toggles. */
export async function loadSiteTabData() {
  const [
    seatDefaults,
    coachBonusRes,
    coachCalPack,
    hideLobbyAnimation,
    examplesPageEnabled,
    freeMaxPlays,
    mobileEditingEnabled,
    hideOwnerInfoAbout,
    referralConfig,
    authProviders,
    coachCalUpgradeBannerEnabled,
    coachCalVersion,
    coachAiEvalDays,
    coachCalFreePromptAllowance,
    suggestReviews,
  ] = await Promise.all([
    getSeatDefaults(),
    listCoachBonusGrantsAction(),
    getCoachCalPackConfig(),
    getHideLobbyAnimation(),
    getExamplesPageEnabled(),
    getFreeMaxPlaysPerPlaybook(),
    getMobileEditingEnabled(),
    getHideOwnerInfoAbout(),
    getReferralConfig(),
    getAuthProvidersConfig(),
    getCoachCalUpgradeBannerEnabled(),
    getCoachCalVersion(),
    getCoachAiEvalDays(),
    getCoachCalFreePromptAllowance(),
    getSuggestReviews(),
  ]);

  return {
    seatDefaults,
    coachBonusRows: coachBonusRes.ok ? coachBonusRes.rows : [],
    coachCalPack,
    hideLobbyAnimation,
    examplesPageEnabled,
    freeMaxPlays,
    mobileEditingEnabled,
    hideOwnerInfoAbout,
    referralConfig,
    appleSigninEnabled: authProviders.apple,
    googleSigninEnabled: authProviders.google,
    coachCalUpgradeBannerEnabled,
    coachCalVersion,
    coachAiEvalDays,
    coachCalFreePromptAllowance,
    suggestReviews,
  };
}

/** Opex tab — services + the current month's entries. */
export async function loadOpexTabData() {
  const period = currentMonthYM();
  const [servicesRes, entriesRes] = await Promise.all([
    listOpexServicesAction(),
    listOpexEntriesAction(period),
  ]);
  return {
    services: servicesRes.ok ? servicesRes.services : [],
    entries: entriesRes.ok ? entriesRes.entries : [],
    period,
    error:
      servicesRes.ok && entriesRes.ok
        ? null
        : servicesRes.ok
        ? (entriesRes as { ok: false; error: string }).error
        : (servicesRes as { ok: false; error: string }).error,
  };
}

/** Revenue tab — the lifetime revenue breakdown. */
export async function loadRevenueTabData() {
  const res = await getRevenueBreakdownAction();
  return {
    breakdown: res.ok ? res.breakdown : null,
    error: res.ok ? null : res.error,
  };
}

/** Cal usage tab — Coach Cal token/cost usage summary. */
export async function loadTokenUsageTabData() {
  return listCoachAiTokenUsageAction();
}

/** Playbook seeds tab. */
export async function loadSeedsTabData() {
  const res = await listSeedFormationsAction();
  return { seeds: res.ok ? res.formations : [] };
}

/** Beta features tab. */
export async function loadBetaTabData() {
  return getBetaFeatures();
}

/** Re-engagement sub-tab of Analytics. */
export async function loadReengagementTabData() {
  const res = await getReengagementMetricsAction();
  return {
    metrics: res.ok ? res.metrics : null,
    error: res.ok ? null : res.error,
  };
}

/** App tab — native install/active metrics with internal+tester accounts excluded. */
export async function loadAppMetricsTabData() {
  const res = await getAppMetricsSummaryAction(7);
  return {
    summary: res.ok ? res.summary : null,
    error: res.ok ? null : res.error,
  };
}

/** Functional Testing tab — recent headless E2E runs + their step screenshots. */
export async function loadFunctionalTestsTabData() {
  const res = await listFunctionalTestRunsAction(20);
  return {
    runs: res.ok ? res.runs : [],
    error: res.ok ? null : res.error,
  };
}
