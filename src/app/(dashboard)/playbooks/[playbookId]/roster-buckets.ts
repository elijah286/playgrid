import type { PlaybookRosterMember } from "@/app/actions/playbook-roster";

/**
 * Pure classification of `playbook_members` rows into the buckets the Roster
 * tab renders. Extracted from RosterPanel so the (subtle, regression-prone)
 * rules are unit-testable in isolation.
 *
 * The load-bearing facts about a row:
 * - `label != null`  → occupies a named player SLOT (coach-added, claimed, or
 *   parent-managed). Any role can hold a label (a coach who is also on the
 *   roster as a player has role=editor AND a label).
 * - `role == 'viewer' && user_id != null` → a player who JOINED (accepting an
 *   invite now puts you on the roster automatically), even before they have a
 *   label.
 * - `role != 'viewer' && label == null` → a coach/owner access row.
 * - `status == 'pending'` → not yet confirmed by the coach ("tentative").
 */
export type WithUser = PlaybookRosterMember & { user_id: string };

export type RosterBuckets = {
  /** Every player-spot row — named slots (any role) + joined viewers. Used
   *  for the merge-suggestion heuristic. */
  players: PlaybookRosterMember[];
  /** Rows shown in the Players table: confirmed players + tentative joiners
   *  (so a player sees themselves the moment they join). */
  rosterRows: PlaybookRosterMember[];
  /** Active coach/owner access rows (the Coaches table). */
  activeCoaches: WithUser[];
  /** Pending members awaiting approval — joiners and pending coach
   *  collaborators (the approve/deny queue). */
  pending: WithUser[];
  /** Active players who asked to be upgraded to coach. */
  coachUpgradeRequests: WithUser[];
};

export function bucketRoster(members: PlaybookRosterMember[]): RosterBuckets {
  // A roster player has a label (named slot, ANY role — this is what keeps a
  // coach-who-is-also-a-player visible) OR is a viewer who joined.
  const players = members.filter(
    (m) => m.label !== null || (m.role === "viewer" && m.user_id !== null),
  );
  const coaches = members.filter(
    (m): m is WithUser =>
      m.role !== "viewer" && m.user_id !== null && m.label === null,
  );
  const pending = members.filter(
    (m): m is WithUser =>
      m.status === "pending" && m.user_id !== null && m.label === null,
  );
  const coachUpgradeRequests = members.filter(
    (m): m is WithUser =>
      m.status === "active" &&
      !!m.coach_upgrade_requested_at &&
      m.user_id !== null &&
      m.label === null,
  );
  const rosterRows = players.filter(
    (m) => m.status === "active" || (m.status === "pending" && m.user_id !== null),
  );
  const activeCoaches = coaches.filter((m) => m.status === "active");
  return { players, rosterRows, activeCoaches, pending, coachUpgradeRequests };
}
