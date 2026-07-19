import {
  listUpcomingEventsAcrossPlaybooksAction,
  listMyCoachablePlaybooksAction,
} from "@/app/actions/calendar";
import { getDashboardSummaryAction } from "@/app/actions/plays";
import {
  readSelectedTeam,
  ALL_TEAMS,
} from "@/features/preview-shell/selected-team-server";
import {
  ScheduleClient,
  type ScheduleEvent,
  type ScheduleTeam,
} from "./ScheduleClient";

/**
 * One unified Schedule — the same events the production calendar shows
 * (listUpcomingEventsAcrossPlaybooksAction), scoped by the carried team via
 * filter chips. RSVP + create write through the SAME existing actions.
 */
export default async function AppSchedulePage() {
  const selected = await readSelectedTeam();
  const [evRes, summary, coachRes] = await Promise.all([
    listUpcomingEventsAcrossPlaybooksAction(),
    getDashboardSummaryAction(),
    listMyCoachablePlaybooksAction(),
  ]);

  const teams: ScheduleTeam[] = summary.ok
    ? summary.data.playbooks
        .filter((p) => !p.is_default && !p.is_archived && !p.is_example)
        .map((p) => ({ id: p.id, name: p.name, color: p.color }))
    : [];

  const coachable: ScheduleTeam[] = coachRes.ok
    ? coachRes.playbooks.map((p) => ({ id: p.id, name: p.name, color: p.color }))
    : [];

  let events = evRes.ok ? evRes.events : [];
  if (selected !== ALL_TEAMS) events = events.filter((e) => e.playbookId === selected);

  const mapped: ScheduleEvent[] = events
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => ({
      id: e.id,
      occurrenceDate: e.occurrenceDate,
      playbookId: e.playbookId,
      playbookName: e.playbookName,
      playbookColor: e.playbookColor,
      type: e.type,
      title: e.title,
      startsAt: e.startsAt,
      opponent: e.opponent,
      homeAway: e.homeAway,
      locationName: e.location.name,
      locationAddress: e.location.address,
      recurring: !!e.recurrenceRule,
      myRsvp: e.myRsvp?.status ?? null,
    }));

  return (
    <ScheduleClient
      events={mapped}
      teams={teams}
      coachable={coachable}
      selected={selected}
    />
  );
}
