import { listInboxAlertsAction } from "@/app/actions/inbox";
import { listActivityFeedAction } from "@/app/actions/activity";
import {
  readSelectedTeam,
  ALL_TEAMS,
} from "@/features/preview-shell/selected-team-server";
import {
  AlertsClient,
  type AlertItem,
  type ActivityItem,
} from "./AlertsClient";

const NEEDS_YOU_KINDS = new Set([
  "rsvp_pending",
  "membership",
  "coach_upgrade",
  "roster_claim",
  "share",
]);

/**
 * Alerts — action items ("Needs you") cleanly split from FYI ("Activity"),
 * the two concepts the production Inbox conflates. Same sources
 * (listInboxAlertsAction + listActivityFeedAction), scoped by the carried team.
 */
export default async function AppAlertsPage() {
  const selected = await readSelectedTeam();
  const [alertRes, actRes] = await Promise.all([
    listInboxAlertsAction(),
    listActivityFeedAction(),
  ]);

  let alerts = alertRes.ok
    ? alertRes.alerts.filter((a) => a.status === "active" && NEEDS_YOU_KINDS.has(a.kind))
    : [];
  let acts = actRes.ok ? actRes.entries : [];
  if (selected !== ALL_TEAMS) {
    alerts = alerts.filter((a) => a.playbookId === selected);
    acts = acts.filter((a) => a.playbookId === selected);
  }

  const needsYou: AlertItem[] = alerts.map((a) => ({
    key: a.key,
    kind: a.kind,
    playbookId: a.playbookId,
    playbookName: a.playbookName,
    playbookColor: a.playbookColor,
    eventTitle: a.eventTitle ?? null,
    who: a.displayName ?? null,
    body: a.body ?? null,
    href: a.href ?? null,
    // Threaded through so the row can approve/deny inline (rank 4).
    userId: a.userId ?? null,
    claimId: a.claimId ?? null,
  }));

  const activity: ActivityItem[] = acts.map((a) => ({
    id: a.id,
    kind: a.kind,
    playbookId: a.playbookId,
    playbookName: a.playbookName,
    playbookColor: a.playbookColor,
    actor: a.actorDisplayName ?? null,
    occurredAt: a.occurredAt,
    playId: a.playId ?? null,
    playName: a.playName ?? null,
  }));

  return (
    <AlertsClient
      needsYou={needsYou}
      activity={activity}
      scoped={selected !== ALL_TEAMS}
    />
  );
}
