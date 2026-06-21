import type { SportVariant } from "@/domain/play/types";

// Variants we can seed with starter plays (each has a public example playbook).
export const SEEDABLE_VARIANTS: { value: SportVariant; label: string }[] = [
  { value: "flag_5v5", label: "Flag 5v5" },
  { value: "flag_7v7", label: "Flag 7v7" },
  { value: "tackle_11", label: "Tackle 11v11" },
];

export type LeagueTeamPlaybook = { id: string; name: string };

export type LeaguePlaybookTeam = {
  teamId: string;
  teamName: string;
  headCoachEmail: string | null;
  playbooks: LeagueTeamPlaybook[];
};
