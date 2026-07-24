import { listInboxAlertsAction } from "@/app/actions/inbox";
import { listActivityFeedAction } from "@/app/actions/activity";
import {
  AlertsClient,
  type AlertItem,
  type ActivityItem,
} from "./AlertsClient";

/**
 * Alerts — action items ("Needs you") cleanly split from FYI ("Activity"),
 * the two concepts the production Inbox conflates. Same sources
 * (listInboxAlertsAction + listActivityFeedAction).
 *
 * Cross-team by design: the header bell counts EVERY active alert across all
 * teams (getInboxBadgeStateAction), so this page must too — scoping to the
 * carried team, or dropping alert kinds, left the bell showing a count with
 * nothing behind it. Alerts is a global surface like Messages/Home; team
 * scope lives on the Team hub, not here.
 */
export default async function AppAlertsPage() {
  const [alertRes, actRes] = await Promise.all([
    listInboxAlertsAction(),
    listActivityFeedAction(),
  ]);

  // Every active alert the bell counts — no kind filter (system notices,
  // feedback, billing, etc. all badge, so they all need a home here).
  const alerts = alertRes.ok ? alertRes.alerts.filter((a) => a.status === "active") : [];
  const acts = actRes.ok ? actRes.entries : [];

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
    <AlertsClient needsYou={needsYou} activity={activity} scoped={false} />
  );
}
