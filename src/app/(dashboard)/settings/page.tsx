import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { listUsersForAdminAction } from "@/app/actions/admin-users";
import {
  getClaudeIntegrationStatusAction,
  getOpenAIIntegrationStatusAction,
} from "@/app/actions/admin-integrations";
import { getResendStatusAction } from "@/app/actions/admin-resend";
import { getGoogleMapsStatusAction } from "@/app/actions/admin-google-maps";
import { getMaxMindStatusAction } from "@/app/actions/admin-maxmind";
import { getRedditPixelStatusAction } from "@/app/actions/admin-reddit-pixel";
import {
  getFeedbackWidgetEnabledAction,
  listFeedbackForAdminAction,
} from "@/app/actions/feedback";
import { listCoachInvitationsAction } from "@/app/actions/coach-invitations";
import {
  getBillingSummaryForOverviewAction,
  getRevenueBreakdownAction,
  getStripeConfigStatusAction,
  listCancellationFeedbackForAdminAction,
  listGiftCodesAction,
} from "@/app/actions/admin-billing";
import { getCoachAiTierEnabled } from "@/lib/site/pricing-config";
import { getSeatDefaults } from "@/lib/site/seat-defaults-config";
import { getCoachCalPackConfig } from "@/lib/site/coach-cal-pack-config";
import { listCoachBonusGrantsAction } from "@/app/actions/admin-seat-config";
import { getHideLobbyAnimation } from "@/lib/site/lobby-config";
import { getExamplesPageEnabled } from "@/lib/site/examples-config";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { getMobileEditingEnabled } from "@/lib/site/mobile-editing-config";
import { getHideOwnerInfoAbout } from "@/lib/site/about-config";
import { getAuthProvidersConfig } from "@/lib/site/auth-providers-config";
import { getReferralConfig } from "@/lib/site/referral-config";
import { getCoachCalUpgradeBannerEnabled } from "@/lib/site/coach-cal-banner-config";
import { getCoachCalVersion } from "@/lib/site/coach-cal-version";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import { getBetaFeatures } from "@/lib/site/beta-features-config";
import { getTrafficSummaryAction } from "@/app/actions/admin-traffic";
import { getGeoSummaryAction } from "@/app/actions/admin-geography";
import { getActivationSummaryAction } from "@/app/actions/admin-activation";
import { getReengagementMetricsAction } from "@/app/actions/admin-reengagement";
import { getShareLifetimeSummaryAction } from "@/app/actions/admin-traffic-insights";
import { getAnalyticsExcludedEmails } from "@/lib/site/analytics-exclusions-config";
import { listSeedFormationsAction } from "@/app/actions/formations";
import { listCoachAiKbMissesAction } from "@/app/actions/coach-ai-feedback";
import {
  listOpexServicesAction,
  listOpexEntriesAction,
} from "@/app/actions/admin-opex";
import {
  getAnthropicAdminKeyStatusAction,
  getOpenAIAdminKeyStatusAction,
} from "@/app/actions/admin-integrations";
import { SettingsClient } from "./ui";

function currentMonthYM(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type OverviewWindow = "7d" | "30d" | "90d" | "all";

function resolveOverviewWindow(raw: string | string[] | undefined): OverviewWindow {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") {
    return value;
  }
  return "30d";
}

/** Days to query for the Overview window — capped so the "all" view doesn't
 *  blow up the aggregators. UI computes deltas vs the prior equal period from
 *  byDay, so we ask for 2× the chosen window. */
function windowDaysFor(window: OverviewWindow): number {
  if (window === "7d") return 14;
  if (window === "30d") return 60;
  if (window === "90d") return 180;
  return 365;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/home");

  const resolvedParams = (await searchParams) ?? {};
  const overviewWindow = resolveOverviewWindow(resolvedParams.overview_window);
  const overviewWindowDays = windowDaysFor(overviewWindow);

  const opexPeriod = currentMonthYM();
  const [
    usersRes,
    integrationRes,
    claudeRes,
    resendRes,
    googleMapsRes,
    maxmindRes,
    redditPixelRes,
    feedbackRes,
    invitesRes,
    feedbackWidgetRes,
    giftCodesRes,
    stripeStatusRes,
    coachAiEnabled,
    hideLobbyAnimation,
    examplesPageEnabled,
    freeMaxPlays,
    trafficRes,
    geoRes,
    activationRes,
    reengagementRes,
    seedsRes,
    mobileEditingEnabled,
    betaFeatures,
    hideOwnerInfoAbout,
    coachAiKbMissesRes,
    opexServicesRes,
    opexEntriesRes,
    anthropicAdminKeyRes,
    openaiAdminKeyRes,
    seatDefaults,
    coachBonusRes,
    coachCalPack,
    referralConfig,
    authProviders,
    analyticsExcludedEmails,
    coachCalUpgradeBannerEnabled,
    coachAiEvalDays,
    cancellationFeedbackRes,
    billingSummaryRes,
    shareLifetimeRes,
    revenueBreakdownRes,
    coachCalVersion,
  ] = await Promise.all([
    listUsersForAdminAction(),
    getOpenAIIntegrationStatusAction(),
    getClaudeIntegrationStatusAction(),
    getResendStatusAction(),
    getGoogleMapsStatusAction(),
    getMaxMindStatusAction(),
    getRedditPixelStatusAction(),
    listFeedbackForAdminAction(),
    listCoachInvitationsAction(),
    getFeedbackWidgetEnabledAction(),
    listGiftCodesAction(),
    getStripeConfigStatusAction(),
    getCoachAiTierEnabled(),
    getHideLobbyAnimation(),
    getExamplesPageEnabled(),
    getFreeMaxPlaysPerPlaybook(),
    getTrafficSummaryAction(overviewWindowDays),
    getGeoSummaryAction(overviewWindowDays),
    getActivationSummaryAction(),
    getReengagementMetricsAction(),
    listSeedFormationsAction(),
    getMobileEditingEnabled(),
    getBetaFeatures(),
    getHideOwnerInfoAbout(),
    listCoachAiKbMissesAction("unreviewed"),
    listOpexServicesAction(),
    listOpexEntriesAction(opexPeriod),
    getAnthropicAdminKeyStatusAction(),
    getOpenAIAdminKeyStatusAction(),
    getSeatDefaults(),
    listCoachBonusGrantsAction(),
    getCoachCalPackConfig(),
    getReferralConfig(),
    getAuthProvidersConfig(),
    getAnalyticsExcludedEmails(),
    getCoachCalUpgradeBannerEnabled(),
    getCoachAiEvalDays(),
    listCancellationFeedbackForAdminAction(),
    getBillingSummaryForOverviewAction(),
    getShareLifetimeSummaryAction(),
    getRevenueBreakdownAction(),
    getCoachCalVersion(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Site admin</h1>
      </div>

      <SettingsClient
        currentUserId={user.id}
        initialUsers={usersRes.ok ? usersRes.users : []}
        usersError={usersRes.ok ? null : usersRes.error}
        integration={
          integrationRes.ok
            ? {
                ok: true,
                configured: integrationRes.configured,
                statusLabel: integrationRes.statusLabel,
                updatedAt: integrationRes.updatedAt,
              }
            : { ok: false, error: integrationRes.error }
        }
        claude={
          claudeRes.ok
            ? {
                ok: true,
                configured: claudeRes.configured,
                statusLabel: claudeRes.statusLabel,
                provider: claudeRes.provider,
                updatedAt: claudeRes.updatedAt,
              }
            : { ok: false, error: claudeRes.error }
        }
        resend={
          resendRes.ok
            ? {
                ok: true,
                configured: resendRes.configured,
                statusLabel: resendRes.statusLabel,
                fromEmail: resendRes.fromEmail,
                contactToEmail: resendRes.contactToEmail,
                updatedAt: resendRes.updatedAt,
              }
            : { ok: false, error: resendRes.error }
        }
        googleMaps={
          googleMapsRes.ok
            ? {
                ok: true,
                configured: googleMapsRes.configured,
                statusLabel: googleMapsRes.statusLabel,
                updatedAt: googleMapsRes.updatedAt,
              }
            : { ok: false, error: googleMapsRes.error }
        }
        maxmind={
          maxmindRes.ok
            ? {
                ok: true,
                configured: maxmindRes.configured,
                statusLabel: maxmindRes.statusLabel,
                downloadedAt: maxmindRes.downloadedAt,
              }
            : { ok: false, error: maxmindRes.error }
        }
        redditPixel={
          redditPixelRes.ok
            ? {
                ok: true,
                configured: redditPixelRes.configured,
                statusLabel: redditPixelRes.statusLabel,
              }
            : { ok: false, error: redditPixelRes.error }
        }
        initialFeedback={feedbackRes.ok ? feedbackRes.items : []}
        feedbackError={feedbackRes.ok ? null : feedbackRes.error}
        initialFeedbackWidgetEnabled={feedbackWidgetRes.enabled}
        initialFeedbackWidgetTouchEnabled={feedbackWidgetRes.touchEnabled}
        initialInvites={invitesRes.ok ? invitesRes.items : []}
        invitesError={invitesRes.ok ? null : invitesRes.error}
        initialGiftCodes={giftCodesRes.ok ? giftCodesRes.codes : []}
        giftCodesError={giftCodesRes.ok ? null : giftCodesRes.error}
        stripeStatus={
          stripeStatusRes.ok
            ? stripeStatusRes.status
            : {
                hasSecretKey: false,
                hasWebhookSecret: false,
                hasPublishableKey: false,
                mode: null,
                updatedAt: null,
                publishableKey: null,
                priceIds: {
                  coach_month: null,
                  coach_year: null,
                  coach_ai_month: null,
                  coach_ai_year: null,
                  seat_month: null,
                  seat_year: null,
                  coach_cal_pack: null,
                },
              }
        }
        initialCoachAiEnabled={coachAiEnabled}
        initialHideLobbyAnimation={hideLobbyAnimation}
        initialExamplesPageEnabled={examplesPageEnabled}
        initialFreeMaxPlays={freeMaxPlays}
        initialMobileEditingEnabled={mobileEditingEnabled}
        initialTrafficSummary={
          trafficRes.ok
            ? trafficRes.summary
            : {
                windowDays: 30,
                totals: {
                  views: 0,
                  uniqueSessions: 0,
                  signups: 0,
                  totalUsers: 0,
                  activeLast7: 0,
                  activeLast30: 0,
                },
                conversion: { sessions: 0, sessionsWithSignup: 0, rate: 0 },
                byDay: [],
                topReferrers: [],
                topPaths: [],
                topCountries: [],
                deviceMix: { mobile: 0, tablet: 0, desktop: 0, unknown: 0 },
                utmSources: [],
              }
        }
        trafficError={trafficRes.ok ? null : trafficRes.error}
        initialGeoSummary={
          geoRes.ok
            ? geoRes.summary
            : {
                windowDays: 30,
                totals: {
                  plottedViews: 0,
                  plottedSessions: 0,
                  plottedUsers: 0,
                  cities: 0,
                  countries: 0,
                  missingLocation: 0,
                },
                cities: [],
                countries: [],
              }
        }
        geoError={geoRes.ok ? null : geoRes.error}
        initialActivationSummary={
          activationRes.ok
            ? activationRes.summary
            : null
        }
        activationError={activationRes.ok ? null : activationRes.error}
        initialReengagementMetrics={reengagementRes.ok ? reengagementRes.metrics : null}
        reengagementError={reengagementRes.ok ? null : reengagementRes.error}
        initialExcludedEmails={analyticsExcludedEmails}
        initialSeeds={seedsRes.ok ? seedsRes.formations : []}
        initialBetaFeatures={betaFeatures}
        initialHideOwnerInfoAbout={hideOwnerInfoAbout}
        initialReferralConfig={referralConfig}
        initialAppleSigninEnabled={authProviders.apple}
        initialGoogleSigninEnabled={authProviders.google}
        initialGoogleOAuthWebClientId={authProviders.googleOAuthWebClientId}
        initialCoachCalUpgradeBannerEnabled={coachCalUpgradeBannerEnabled}
        initialCoachCalVersion={coachCalVersion}
        initialCoachAiEvalDays={coachAiEvalDays}
        initialCoachAiKbMisses={coachAiKbMissesRes.ok ? coachAiKbMissesRes.items : []}
        coachAiKbMissesError={coachAiKbMissesRes.ok ? null : coachAiKbMissesRes.error}
        initialOpexServices={opexServicesRes.ok ? opexServicesRes.services : []}
        initialOpexEntries={opexEntriesRes.ok ? opexEntriesRes.entries : []}
        initialOpexPeriod={opexPeriod}
        opexError={
          opexServicesRes.ok && opexEntriesRes.ok
            ? null
            : opexServicesRes.ok
              ? (opexEntriesRes as { ok: false; error: string }).error
              : (opexServicesRes as { ok: false; error: string }).error
        }
        anthropicAdminKey={
          anthropicAdminKeyRes.ok
            ? { configured: anthropicAdminKeyRes.configured, statusLabel: anthropicAdminKeyRes.statusLabel }
            : { configured: false, statusLabel: "No admin key is saved yet." }
        }
        openaiAdminKey={
          openaiAdminKeyRes.ok
            ? { configured: openaiAdminKeyRes.configured, statusLabel: openaiAdminKeyRes.statusLabel }
            : { configured: false, statusLabel: "No admin key is saved yet." }
        }
        initialSeatDefaults={seatDefaults}
        initialCoachBonusRows={coachBonusRes.ok ? coachBonusRes.rows : []}
        initialCoachCalPack={coachCalPack}
        initialCancellationFeedback={
          cancellationFeedbackRes.ok ? cancellationFeedbackRes.rows : []
        }
        cancellationFeedbackError={
          cancellationFeedbackRes.ok ? null : cancellationFeedbackRes.error
        }
        overviewWindow={overviewWindow}
        initialBillingSummary={billingSummaryRes.ok ? billingSummaryRes.summary : null}
        billingSummaryError={billingSummaryRes.ok ? null : billingSummaryRes.error}
        initialShareLifetime={shareLifetimeRes.ok ? shareLifetimeRes.summary : null}
        shareLifetimeError={shareLifetimeRes.ok ? null : shareLifetimeRes.error}
        initialRevenueBreakdown={
          revenueBreakdownRes.ok ? revenueBreakdownRes.breakdown : null
        }
        revenueBreakdownError={
          revenueBreakdownRes.ok ? null : revenueBreakdownRes.error
        }
      />
    </div>
  );
}
