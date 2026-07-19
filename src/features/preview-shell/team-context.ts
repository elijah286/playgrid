import "server-only";
import { cache } from "react";
import type { SportVariant } from "@/domain/play/types";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/request-user";
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

/**
 * The user's real teams — a DELIBERATELY lightweight, request-cached query.
 *
 * This exists because the shell needs the team list on nearly every render (the
 * switcher, the team hub, Home/Schedule/Messages), and the production
 * `getDashboardSummaryAction` is far too heavy for that: it runs
 * ensureDefaultWorkspace, a plays(count) aggregation, shared-owner name
 * resolution, downgrade-lock computation, AND up to N per-playbook preview
 * fetches — none of which the shell needs. Calling that 3× per navigation was
 * the cause of the shell feeling slow. This does ONE join and nothing else, and
 * React `cache()` dedupes it across the layout + nested layout + page within a
 * single request.
 */
export const listShellTeams = cache(async (): Promise<TeamMeta[]> => {
  const auth = await getRequestUser();
  const user = auth.kind === "ok" ? auth.user : null;
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbook_members")
    .select(
      "role, playbooks!inner(id, name, is_default, is_archived, is_example, logo_url, color, season, sport_variant)",
    )
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error || !data) return [];

  type Row = {
    role: "owner" | "editor" | "viewer";
    playbooks:
      | {
          id: string;
          name: string;
          is_default: boolean | null;
          is_archived: boolean | null;
          is_example: boolean | null;
          logo_url: string | null;
          color: string | null;
          season: string | null;
          sport_variant: string | null;
        }
      | Array<Record<string, unknown>>
      | null;
  };

  const out: TeamMeta[] = [];
  for (const r of data as unknown as Row[]) {
    const p = Array.isArray(r.playbooks) ? (r.playbooks[0] as Row["playbooks"]) : r.playbooks;
    if (!p || Array.isArray(p)) continue;
    if (p.is_default || p.is_archived || p.is_example) continue;
    out.push({
      id: p.id,
      name: p.name,
      color: p.color,
      logoUrl: p.logo_url,
      season: p.season,
      role: r.role,
      sportVariant: (p.sport_variant as SportVariant) ?? "flag_7v7",
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
});

/** The team the shell is currently scoped to, or null when "All teams" / gone. */
export async function getSelectedTeamMeta(): Promise<TeamMeta | null> {
  const selected = await readSelectedTeam();
  if (selected === ALL_TEAMS) return null;
  const teams = await listShellTeams();
  return teams.find((t) => t.id === selected) ?? null;
}

/** The user's real teams, for the "pick a team" state / switcher. */
export async function listSelectableTeams(): Promise<SelectableTeam[]> {
  const teams = await listShellTeams();
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    logoUrl: t.logoUrl,
    season: t.season,
  }));
}
