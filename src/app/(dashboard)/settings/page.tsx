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
import {
  getFeedbackWidgetEnabledAction,
  listFeedbackForAdminAction,
} from "@/app/actions/feedback";
import { listCoachInvitationsAction } from "@/app/actions/coach-invitations";
import {
  getStripeConfigStatusAction,
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
import { getReferralConfig } from "@/lib/site/referral-config";
import { getBetaFeatures } from "@/lib/site/beta-features-config";
import { getTrafficSummaryAction } from "@/app/actions/admin-traffic";
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

export default async function SettingsPage() {
  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/home");

  const opexPeriod = currentMonthYM();
  const [
    usersRes,
    integrationRes,
    claudeRes,
    resendRes,
    googleMapsRes,
    maxmindRes,
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
  ] = await Promise.all([
    listUsersForAdminAction(),
    getOpenAIIntegrationStatusAction(),
    getClaudeIntegrationStatusAction(),
    getResendStatusAction(),
    getGoogleMapsStatusAction(),
    getMaxMindStatusAction(),
    listFeedbackForAdminAction(),
    listCoachInvitationsAction(),
    getFeedbackWidgetEnabledAction(),
    listGiftCodesAction(),
    getStripeConfigStatusAction(),
    getCoachAiTierEnabled(),
    getHideLobbyAnimation(),
    getExamplesPageEnabled(),
    getFreeMaxPlaysPerPlaybook(),
    getTrafficSummaryAction(30),
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
        initialSeeds={seedsRes.ok ? seedsRes.formations : []}
        initialBetaFeatures={betaFeatures}
        initialHideOwnerInfoAbout={hideOwnerInfoAbout}
        initialReferralConfig={referralConfig}
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
      />
    </div>
  );
}
