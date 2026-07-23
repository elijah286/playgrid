import { listUpcomingEventsAcrossPlaybooksAction } from "@/app/actions/calendar";
import {
  readSelectedTeam,
  ALL_TEAMS,
} from "@/features/preview-shell/selected-team-server";
import { listShellTeams } from "@/features/preview-shell/team-context";
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
  const [evRes, shellTeams] = await Promise.all([
    listUpcomingEventsAcrossPlaybooksAction(),
    listShellTeams(), // cached from the shell layout — no extra query
  ]);

  const teams: ScheduleTeam[] = shellTeams.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
  }));
  // Coaches can create events; derive from the same cached list (no separate query).
  const coachable: ScheduleTeam[] = shellTeams
    .filter((t) => t.role === "owner" || t.role === "editor")
    .map((t) => ({ id: t.id, name: t.name, color: t.color }));

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
      durationMinutes: e.durationMinutes,
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
