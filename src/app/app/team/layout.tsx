import {
  getSelectedTeamMeta,
  listSelectableTeams,
  listShellTeams,
} from "@/features/preview-shell/team-context";
import { TeamHubChrome } from "@/features/preview-shell/TeamHubChrome";
import { SPORT_VARIANT_LABELS } from "@/domain/playbook/settings";
import { TeamPicker } from "./TeamPicker";

/**
 * Team hub shell. When a single team is carried, renders the shared banner +
 * sub-nav (TeamHubChrome) around every /app/team/* screen. When scope is
 * "All teams", shows the picker instead.
 */
export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const team = await getSelectedTeamMeta();
  if (!team) {
    const teams = await listSelectableTeams();
    return <TeamPicker teams={teams} />;
  }
  // The Team hub now owns the only team switcher in the shell, so it needs the
  // full team list + the selected id (both request-cached — no extra query).
  const teams = await listShellTeams();
  return (
    <TeamHubChrome
      team={{
        name: team.name,
        color: team.color,
        logoUrl: team.logoUrl,
        season: team.season,
        sportLabel: SPORT_VARIANT_LABELS[team.sportVariant] ?? null,
      }}
      teams={teams}
      selected={team.id}
    >
      {children}
    </TeamHubChrome>
  );
}
