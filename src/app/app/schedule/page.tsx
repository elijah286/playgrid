import { listUpcomingEventsAcrossPlaybooksAction } from "@/app/actions/calendar";
import { listShellTeams } from "@/features/preview-shell/team-context";
import {
  ScheduleClient,
  type ScheduleEvent,
  type ScheduleTeam,
} from "./ScheduleClient";

/**
 * One unified Schedule — the same events the production calendar shows
 * (listUpcomingEventsAcrossPlaybooksAction), across ALL the user's teams. The
 * client's own multi-select dropdown decides which teams are visible (Calendar
 * is a cross-team surface — it owns its selection, not the carried cookie).
 * RSVP + create write through the SAME existing actions.
 */
export default async function AppSchedulePage() {
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

  const events = evRes.ok ? evRes.events : [];

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

  return <ScheduleClient events={mapped} teams={teams} coachable={coachable} />;
}
