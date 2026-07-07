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
import { canUseAiFeatures, tierAtLeast } from "@/lib/billing/features";
import { hasFreeCalPromptsRemaining } from "@/lib/billing/coach-cal-free-prompts";
import { withTimeout } from "@/lib/perf/with-timeout";
import { Suspense } from "react";
import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { isLeagueOrganizer } from "@/lib/league/access";
import {
  getExamplePromoMode,
  resolveExamplePromo,
} from "@/lib/site/example-promo-config";
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
  // searchParams is request data, not a network round-trip — read it here,
  // then stream the dashboard behind Suspense. The native shell lifts its
  // loading overlay once THIS shell hydrates (NativeAppShell), so streaming
  // lets coaches see the skeleton immediately instead of staring at the
  // overlay until the slowest of seven data fetches returns. The actual data
  // + DashboardClient render unchanged inside DashboardData below.
  const { error: errFromQuery, tab, welcome } = await searchParams;
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData errFromQuery={errFromQuery} tab={tab} welcome={welcome} />
    </Suspense>
  );
}

// Lightweight stand-in for the tab bar + playbook tile grid. Rendered into
// the initial HTML so the overlay lifts onto structured content, not a blank
// page. Neutral opacity tokens (not theme colors) so it reads correctly in
// both light and dark before the real content streams in.
function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="flex gap-2">
        <div className="h-9 w-28 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
        <div className="h-9 w-28 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
        <div className="h-9 w-24 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl bg-black/5 dark:bg-white/10"
          />
        ))}
      </div>
    </div>
  );
}

async function DashboardData({
  errFromQuery,
  tab,
  welcome,
}: {
  errFromQuery?: string;
  tab?: string;
  welcome?: string;
}) {
  // League operators get the SAME coach dashboard as everyone else (their
  // starting experience), plus a banner inviting them into the league console —
  // rather than an auto-redirect. Fail-open by construction: isLeagueOrganizer()
  // returns false for non-organizers / signed-out / kill-switch / query errors,
  // wrapped so any infra error just hides the banner.
  let isOrganizer = false;
  try {
    isOrganizer = await isLeagueOrganizer();
  } catch {
    isOrganizer = false;
  }

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
  const coachAiEntitled = isAdmin || canUseAiFeatures(entitlement);
  // Free users with trial prompts left get the real launcher, not the promo
  // (same gate as SiteHeader).
  const hasFreeCalPrompts =
    !coachAiEntitled && profileRes.user
      ? await hasFreeCalPromptsRemaining(profileRes.user.id)
      : false;
  const coachAiAvailable = coachAiEntitled || hasFreeCalPrompts;
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
  // Example-playbook promotion for the new-user empty state (admin-controlled:
  // off / A/B / everyone). Resolved per-user so the A/B bucket is stable.
  const examplePromoMode = await withTimeout(
    getExamplePromoMode(),
    DATA_TIMEOUT_MS,
    "off" as const,
  );
  const examplePromo = resolveExamplePromo(
    examplePromoMode,
    profileRes.user?.id ?? null,
  );
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
      {isOrganizer && (
        <Link
          href="/league"
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition hover:bg-primary/10"
        >
          <span className="flex items-center gap-2.5 text-sm">
            <Trophy className="size-5 shrink-0 text-primary" />
            <span>
              <span className="font-semibold text-foreground">
                Try the league operator experience
              </span>
              <span className="ml-1.5 text-muted">
                — run divisions, registration, schedules &amp; more.
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-primary">
            Open console
            <ChevronRight className="size-4" />
          </span>
        </Link>
      )}
      {errFromQuery && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">
          {errFromQuery}
        </p>
      )}
      {!res.ok && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">
          {res.error}
        </p>
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
          examplePromo={examplePromo}
          coachAiAvailable={coachAiAvailable}
          showCoachCalPromo={showCoachCalPromo}
          showCoachProWelcome={showCoachProWelcome}
          showTeamCoachWelcome={showTeamCoachWelcome}
        />
      )}
    </div>
  );
}
