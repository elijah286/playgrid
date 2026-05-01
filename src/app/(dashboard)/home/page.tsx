import { getDashboardSummaryAction } from "@/app/actions/plays";
import { listInboxAlertsAction } from "@/app/actions/inbox";
import { listActivityFeedAction } from "@/app/actions/activity";
import { getHideLobbyAnimation } from "@/lib/site/lobby-config";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { DashboardClient } from "./ui";

type Props = {
  searchParams: Promise<{ error?: string; tab?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const { error: errFromQuery, tab } = await searchParams;
  const [
    res,
    inbox,
    activity,
    hideAnimation,
    profileRes,
    betaFeatures,
    entitlement,
  ] = await Promise.all([
    getDashboardSummaryAction(),
    listInboxAlertsAction(),
    listActivityFeedAction(),
    getHideLobbyAnimation(),
    getCurrentUserProfile(),
    getBetaFeatures(),
    getCurrentEntitlement(),
  ]);
  const isAdmin = profileRes.profile?.role === "admin";
  const teamCalendarAvailable = isBetaFeatureAvailable(
    betaFeatures.team_calendar,
    { isAdmin, isEntitled: true },
  );
  const canUseTeamFeatures = isAdmin || tierAtLeast(entitlement, "coach");
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
        />
      )}
    </div>
  );
}
