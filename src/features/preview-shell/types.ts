/** Shared, serializable types for the new-UX preview shell (`/app/*`). */

export type ShellTeamRole = "owner" | "editor" | "viewer";

/** A team (playbook) as shown in the switcher + team-scoped chrome. */
export type ShellTeam = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  season: string | null;
  role: ShellTeamRole;
};

/** The signed-in user, for the header avatar / account affordance. */
export type ShellUser = {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};
