import "server-only";
import type { SportVariant } from "@/domain/play/types";
import { getDashboardSummaryAction } from "@/app/actions/plays";
import { readSelectedTeam, ALL_TEAMS } from "./selected-team-server";

export type TeamMeta = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  season: string | null;
  role: "owner" | "editor" | "viewer";
  sportVariant: SportVariant;
};

export type SelectableTeam = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  season: string | null;
};

/** The team the shell is currently scoped to, resolved to its metadata, or
 *  null when scope is "All teams" / the team is no longer accessible. */
export async function getSelectedTeamMeta(): Promise<TeamMeta | null> {
  const selected = await readSelectedTeam();
  if (selected === ALL_TEAMS) return null;
  const summary = await getDashboardSummaryAction();
  if (!summary.ok) return null;
  const p = summary.data.playbooks.find((t) => t.id === selected && !t.is_default);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    logoUrl: p.logo_url,
    season: p.season,
    role: p.role,
    sportVariant: p.sport_variant,
  };
}

/** The user's real teams, for the "pick a team" state. */
export async function listSelectableTeams(): Promise<SelectableTeam[]> {
  const summary = await getDashboardSummaryAction();
  if (!summary.ok) return [];
  return summary.data.playbooks
    .filter((p) => !p.is_default && !p.is_archived && !p.is_example)
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      logoUrl: p.logo_url,
      season: p.season,
    }));
}
