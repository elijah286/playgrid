import "server-only";
import { cookies } from "next/headers";
import { SELECTED_TEAM_COOKIE, ALL_TEAMS } from "./selected-team";

export { ALL_TEAMS };

/**
 * The team the new-UX shell is currently scoped to (a playbook id, or
 * ALL_TEAMS). Server-only — reads the cookie. Defaults to ALL_TEAMS.
 */
export async function readSelectedTeam(): Promise<string> {
  const v = (await cookies()).get(SELECTED_TEAM_COOKIE)?.value;
  return v && v.length > 0 ? v : ALL_TEAMS;
}
