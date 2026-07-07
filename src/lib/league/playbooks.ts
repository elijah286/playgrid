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
  /** Most recent invite (or legacy copy-link) sent for this team's playbook. */
  lastSentAt: string | null;
  /** Library items snapshotted into this team's playbook (from the ledger). */
  distributions: TeamDistribution[];
};

export type TeamDistribution = {
  itemId: string | null;
  title: string;
  at: string;
  /** The library item's SOURCE changed after this team's latest copy — a
   *  redistribute would deliver a newer version (as an add-only "(v2)"
   *  group; nothing the coach edited is touched). */
  updateAvailable: boolean;
};

/**
 * Collapse raw ledger rows to one entry per item (latest copy wins) and flag
 * staleness against the source's last-modified time. Pure so the action and
 * any UI preview agree by construction.
 */
export function markStaleDistributions(
  rows: { itemId: string | null; title: string; at: string }[],
  sourceUpdatedAtByItem: Map<string, string>,
): TeamDistribution[] {
  const latest = new Map<string, { itemId: string | null; title: string; at: string }>();
  for (const r of rows) {
    const key = r.itemId ?? `removed:${r.title}`;
    const cur = latest.get(key);
    if (!cur || r.at > cur.at) latest.set(key, r);
  }
  return [...latest.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((r) => ({
      ...r,
      updateAvailable:
        r.itemId !== null &&
        (sourceUpdatedAtByItem.get(r.itemId) ?? "") > r.at,
    }));
}
