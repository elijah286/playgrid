import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { listUsersForAdminAction } from "@/app/actions/admin-users";
import { getOpenAIIntegrationStatusAction } from "@/app/actions/admin-integrations";
import { getResendStatusAction } from "@/app/actions/admin-resend";
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
import { getHideLobbyAnimation } from "@/lib/site/lobby-config";
import { getExamplesPageEnabled } from "@/lib/site/examples-config";
import { getTrafficSummaryAction } from "@/app/actions/admin-traffic";
import { SettingsClient } from "./ui";

export default async function SettingsPage() {
  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/home");

  const [
    usersRes,
    integrationRes,
    resendRes,
    feedbackRes,
    invitesRes,
    feedbackWidgetRes,
    giftCodesRes,
    stripeStatusRes,
    coachAiEnabled,
    hideLobbyAnimation,
    examplesPageEnabled,
    trafficRes,
  ] = await Promise.all([
    listUsersForAdminAction(),
    getOpenAIIntegrationStatusAction(),
    getResendStatusAction(),
    listFeedbackForAdminAction(),
    listCoachInvitationsAction(),
    getFeedbackWidgetEnabledAction(),
    listGiftCodesAction(),
    getStripeConfigStatusAction(),
    getCoachAiTierEnabled(),
    getHideLobbyAnimation(),
    getExamplesPageEnabled(),
    getTrafficSummaryAction(30),
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
        initialFeedback={feedbackRes.ok ? feedbackRes.items : []}
        feedbackError={feedbackRes.ok ? null : feedbackRes.error}
        initialFeedbackWidgetEnabled={feedbackWidgetRes.enabled}
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
                },
              }
        }
        initialCoachAiEnabled={coachAiEnabled}
        initialHideLobbyAnimation={hideLobbyAnimation}
        initialExamplesPageEnabled={examplesPageEnabled}
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
      />
    </div>
  );
}
