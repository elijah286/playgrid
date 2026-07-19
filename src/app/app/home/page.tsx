import { listUpcomingEventsAcrossPlaybooksAction } from "@/app/actions/calendar";
import { listInboxAlertsAction } from "@/app/actions/inbox";
import { getDashboardSummaryAction } from "@/app/actions/plays";
import {
  readSelectedTeam,
  ALL_TEAMS,
} from "@/features/preview-shell/selected-team-server";
import {
  HomeToday,
  type TodayEvent,
  type NeedsYouItem,
  type HomeTeam,
} from "./HomeToday";

// Kinds that represent an action the coach must take (the "Needs you" block).
// Everything else (FYI activity, admin notices) is intentionally excluded.
const NEEDS_YOU_KINDS = new Set([
  "rsvp_pending",
  "membership",
  "coach_upgrade",
  "roster_claim",
  "share",
]);

/**
 * Home = "Today". Reads the SAME data the production lobby uses
 * (listUpcomingEventsAcrossPlaybooksAction + listInboxAlertsAction), scoped by
 * the carried team. No new data, no new writes — a lens over production rows.
 */
export default async function AppHomePage() {
  const selected = await readSelectedTeam();
  const [evRes, alertRes, summary] = await Promise.all([
    listUpcomingEventsAcrossPlaybooksAction(),
    listInboxAlertsAction(),
    getDashboardSummaryAction(),
  ]);

  const teams: HomeTeam[] = summary.ok
    ? summary.data.playbooks
        .filter((p) => !p.is_default && !p.is_archived && !p.is_example)
        .map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          logoUrl: p.logo_url,
          season: p.season,
          playCount: p.play_count,
        }))
    : [];

  const nowMs = Date.now();
  let events = evRes.ok ? evRes.events : [];
  if (selected !== ALL_TEAMS) {
    events = events.filter((e) => e.playbookId === selected);
  }
  const todayEvents: TodayEvent[] = events
    .filter((e) => new Date(e.startsAt).getTime() >= nowMs - 2 * 3_600_000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      playbookId: e.playbookId,
      playbookName: e.playbookName,
      playbookColor: e.playbookColor,
      type: e.type,
      title: e.title,
      startsAt: e.startsAt,
      locationName: e.location.name,
      opponent: e.opponent,
      homeAway: e.homeAway,
    }));

  const activeAlerts = alertRes.ok
    ? alertRes.alerts.filter((a) => a.status === "active")
    : [];
  const scopedAlerts =
    selected !== ALL_TEAMS
      ? activeAlerts.filter((a) => a.playbookId === selected)
      : activeAlerts;
  const needsYou: NeedsYouItem[] = scopedAlerts
    .filter((a) => NEEDS_YOU_KINDS.has(a.kind))
    .slice(0, 8)
    .map((a) => ({
      key: a.key,
      kind: a.kind,
      playbookName: a.playbookName,
      playbookColor: a.playbookColor,
      eventTitle: a.eventTitle ?? null,
      who: a.displayName ?? null,
      body: a.body ?? null,
    }));

  const offline = !evRes.ok && !alertRes.ok;

  return (
    <HomeToday
      events={todayEvents}
      needsYou={needsYou}
      teams={teams}
      scoped={selected !== ALL_TEAMS}
      offline={offline}
    />
  );
}
