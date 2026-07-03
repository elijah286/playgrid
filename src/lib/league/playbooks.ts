import type { SportVariant } from "@/domain/play/types";

// Variants we can seed with starter plays (each has a public example playbook).
export const SEEDABLE_VARIANTS: { value: SportVariant; label: string }[] = [
  { value: "flag_5v5", label: "Flag 5v5" },
  { value: "flag_7v7", label: "Flag 7v7" },
  { value: "tackle_11", label: "Tackle 11v11" },
];

export type LeagueTeamPlaybook = { id: string; name: string };

/** Which teams a distribution batch targets. "unseeded" = every team without a
 *  playbook yet (the default — safe to re-run without duplicating work);
 *  "all" = every team, including already-seeded ones (idempotent — re-seeding
 *  a team returns its existing playbook rather than creating a duplicate). */
export type DistributeScope = "unseeded" | "all" | string[];

export type PlaybookSendStatus = "no_playbook" | "not_sent" | "sent" | "claimed";

export type PlaybookDistributionRow = {
  teamId: string;
  teamName: string;
  headCoachEmail: string | null;
  playbook: LeagueTeamPlaybook | null;
  sendStatus: PlaybookSendStatus;
  /** Most recent copy-link creation time for this team's playbook, if any. */
  lastSentAt: string | null;
};
