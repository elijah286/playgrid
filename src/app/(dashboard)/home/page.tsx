import { getDashboardSummaryAction } from "@/app/actions/plays";
import { listInboxAlertsAction } from "@/app/actions/inbox";
import { listActivityFeedAction } from "@/app/actions/activity";
import { getHideLobbyAnimation } from "@/lib/site/lobby-config";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
  DEFAULT_BETA_FEATURES,
} from "@/lib/site/beta-features-config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { withTimeout } from "@/lib/perf/with-timeout";
import { DashboardClient } from "./ui";

// Bound how long a single dashboard data fetch can stall before the page
// renders without it. The dashboard is one of two routes a Capacitor coach
// hits with no signal (the other is /offline); a hung Supabase round-trip
// here used to trap them on a white loading screen forever. The fallbacks
// match each action's "empty" shape so the UI degrades to a blank inbox /
// no-activity state instead of a 500.
const DATA_TIMEOUT_MS = 4000;

type Props = {
  searchParams: Promise<{ error?: string; tab?: string; welcome?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const { error: errFromQuery, tab, welcome } = await searchParams;
  const [
    res,
    inbox,
    activity,
    hideAnimation,
    profileRes,
    betaFeatures,
    entitlement,
  ] = await Promise.all([
    withTimeout(getDashboardSummaryAction(), DATA_TIMEOUT_MS, {
      ok: false as const,
      error: "Couldn't load — check your connection.",
    }),
    withTimeout(listInboxAlertsAction(), DATA_TIMEOUT_MS, {
      ok: false as const,
      error: "offline",
    }),
    withTimeout(listActivityFeedAction(), DATA_TIMEOUT_MS, {
      ok: false as const,
      error: "offline",
    }),
    withTimeout(getHideLobbyAnimation(), DATA_TIMEOUT_MS, false),
    withTimeout(getCurrentUserProfile(), DATA_TIMEOUT_MS, {
      user: null,
      profile: null as { role: string } | null,
    }),
    withTimeout(getBetaFeatures(), DATA_TIMEOUT_MS, DEFAULT_BETA_FEATURES),
    withTimeout(getCurrentEntitlement(), DATA_TIMEOUT_MS, null),
  ]);
  const isAdmin = profileRes.profile?.role === "admin";
  const teamCalendarAvailable = isBetaFeatureAvailable(
    betaFeatures.team_calendar,
    { isAdmin, isEntitled: true },
  );
  const canUseTeamFeatures = isAdmin || tierAtLeast(entitlement, "coach");
  const coachAiAvailable =
    isAdmin || (entitlement?.tier ?? "free") === "coach_ai";
  // Logged-in users without Coach Pro see the promo CTA — same logic as
  // SiteHeader uses to decide whether to render the Cal launcher button.
  const showCoachCalPromo = !coachAiAvailable;
  // Welcome dialogs: only fire when the upgrade-success / checkout-success
  // redirect landed us here AND the user's actual entitlement matches the
  // celebrated tier. The entitlement check is the anti-spoof — pasting
  // either URL on a free account won't trigger a fake celebration. Each
  // dialog strips the `?welcome=` param after mount so a refresh /
  // back-nav can't re-trigger it.
  const showCoachProWelcome =
    welcome === "coach_pro" && entitlement?.tier === "coach_ai";
  const showTeamCoachWelcome =
    welcome === "team_coach" && entitlement?.tier === "coach";
  const inboxAlerts = inbox.ok ? inbox.alerts : [];
  const activityEntries = activity.ok ? activity.entries : [];
  const initialTab: "playbooks" | "calendar" | "inbox" =
    tab === "inbox" || tab === "activity"
      ? "inbox"
      : tab === "calendar" || tab === "playbooks"
        ? tab
        : "playbooks";

  return (
    <div className="space-y-8">
      {errFromQuery && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">
          {errFromQuery}
        </p>
      )}
      {!res.ok && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{res.error}</p>
      )}
      {res.ok && (
        <DashboardClient
          data={res.data}
          hideAnimation={hideAnimation}
          isAdmin={isAdmin}
          teamCalendarAvailable={teamCalendarAvailable}
          canUseTeamFeatures={canUseTeamFeatures}
          inboxAlerts={inboxAlerts}
          activityEntries={activityEntries}
          initialTab={initialTab}
          coachAiAvailable={coachAiAvailable}
          showCoachCalPromo={showCoachCalPromo}
          showCoachProWelcome={showCoachProWelcome}
          showTeamCoachWelcome={showTeamCoachWelcome}
        />
      )}
    </div>
  );
}
