import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { listUsersForAdminAction } from "@/app/actions/admin-users";
import {
  getFeedbackWidgetEnabledAction,
  listFeedbackForAdminAction,
} from "@/app/actions/feedback";
import { listCoachInvitationsAction } from "@/app/actions/coach-invitations";
import {
  getBillingSummaryForOverviewAction,
  getStripeConfigStatusAction,
  listCancellationFeedbackForAdminAction,
  listGiftCodesAction,
} from "@/app/actions/admin-billing";
import { getCoachAiTierEnabled } from "@/lib/site/pricing-config";
import { getTrafficSummaryAction } from "@/app/actions/admin-traffic";
import { getGeoSummaryAction } from "@/app/actions/admin-geography";
import { getActivationSummaryAction } from "@/app/actions/admin-activation";
import { getShareLifetimeSummaryAction } from "@/app/actions/admin-traffic-insights";
import { getAnalyticsExcludedEmails } from "@/lib/site/analytics-exclusions-config";
import { listCoachAiKbMissesAction } from "@/app/actions/coach-ai-feedback";
import { SettingsClient } from "./ui";
import {
  AdminBodySkeleton,
  AdminHeader,
  AdminRouteProgress,
} from "./_components/AdminSkeleton";

export type OverviewWindow = "7d" | "30d" | "90d" | "all";

function resolveOverviewWindow(
  raw: string | string[] | undefined
): OverviewWindow {
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

  // Stream the data-heavy body so the page shell paints immediately.
  // The header renders as real content; the Overview-critical data resolves
  // inside <SettingsBody> behind a Suspense boundary instead of blocking the
  // first byte (TTFB/FCP no longer wait on the slowest query). loading.tsx
  // covers the brief auth gate above this point; this boundary covers the
  // data fetch.
  return (
    <div className="space-y-6">
      <AdminHeader />
      <Suspense
        fallback={
          <>
            <AdminRouteProgress />
            <AdminBodySkeleton />
          </>
        }
      >
        <SettingsBody userId={user.id} overviewWindow={overviewWindow} />
      </Suspense>
    </div>
  );
}

/**
 * Streamed body of the Site admin page. Runs the full data fetch and
 * renders the interactive client. Isolated behind a Suspense boundary
 * (see SettingsPage) so its latency doesn't delay the page shell.
 */
async function SettingsBody({
  userId,
  overviewWindow,
}: {
  userId: string;
  overviewWindow: OverviewWindow;
}) {
  const overviewWindowDays = windowDaysFor(overviewWindow);

  // Eager set: only what the default Overview tab, the nav badges, and the
  // always-visible tabs (Users, Analytics, Geography, Invites, Feedback,
  // AI Feedback, Payments) need. The heavier/occasional tabs fetch their
  // own data on first open — see lazy-data.ts.
  const [
    usersRes,
    feedbackRes,
    invitesRes,
    feedbackWidgetRes,
    giftCodesRes,
    stripeStatusRes,
    coachAiEnabled,
    trafficRes,
    geoRes,
    activationRes,
    coachAiKbMissesRes,
    analyticsExcludedEmails,
    cancellationFeedbackRes,
    billingSummaryRes,
    shareLifetimeRes,
  ] = await Promise.all([
    listUsersForAdminAction(),
    listFeedbackForAdminAction(),
    listCoachInvitationsAction(),
    getFeedbackWidgetEnabledAction(),
    listGiftCodesAction(),
    getStripeConfigStatusAction(),
    getCoachAiTierEnabled(),
    getTrafficSummaryAction(overviewWindowDays),
    getGeoSummaryAction(overviewWindowDays),
    getActivationSummaryAction(),
    listCoachAiKbMissesAction("unreviewed"),
    getAnalyticsExcludedEmails(),
    listCancellationFeedbackForAdminAction(),
    getBillingSummaryForOverviewAction(),
    getShareLifetimeSummaryAction(),
  ]);

  return (
    <SettingsClient
      currentUserId={userId}
      initialUsers={usersRes.ok ? usersRes.users : []}
      usersError={usersRes.ok ? null : usersRes.error}
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
              payingOnly: false,
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
      initialActivationSummary={activationRes.ok ? activationRes.summary : null}
      activationError={activationRes.ok ? null : activationRes.error}
      initialExcludedEmails={analyticsExcludedEmails}
      initialCoachAiKbMisses={
        coachAiKbMissesRes.ok ? coachAiKbMissesRes.items : []
      }
      coachAiKbMissesError={
        coachAiKbMissesRes.ok ? null : coachAiKbMissesRes.error
      }
      initialCancellationFeedback={
        cancellationFeedbackRes.ok ? cancellationFeedbackRes.rows : []
      }
      cancellationFeedbackError={
        cancellationFeedbackRes.ok ? null : cancellationFeedbackRes.error
      }
      overviewWindow={overviewWindow}
      initialBillingSummary={
        billingSummaryRes.ok ? billingSummaryRes.summary : null
      }
      billingSummaryError={
        billingSummaryRes.ok ? null : billingSummaryRes.error
      }
      initialShareLifetime={
        shareLifetimeRes.ok ? shareLifetimeRes.summary : null
      }
      shareLifetimeError={shareLifetimeRes.ok ? null : shareLifetimeRes.error}
    />
  );
}
