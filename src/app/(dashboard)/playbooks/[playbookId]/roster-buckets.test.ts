/**
 * Roster classification — the rules that decide who shows where on the
 * Roster tab. This is the highest-risk logic in the player-self-roster
 * change (it decides whether a real person appears or vanishes), so it's
 * pinned exhaustively.
 *
 * REGRESSION GUARD: an earlier draft required `role === 'viewer'` to be a
 * player, which dropped a coach-who-is-also-a-player (editor/owner row WITH
 * a label) out of BOTH the Players and Coaches lists — they vanished from
 * the roster. The `coach is also a roster player` case below locks that.
 */
import { describe, expect, it } from "vitest";
import { bucketRoster } from "./roster-buckets";
import type { PlaybookRosterMember } from "@/app/actions/playbook-roster";

let seq = 0;
function member(overrides: Partial<PlaybookRosterMember>): PlaybookRosterMember {
  seq += 1;
  return {
    id: `m${seq}`,
    user_id: null,
    managed_by: null,
    manager_display_name: null,
    role: "viewer",
    status: "active",
    label: null,
    jersey_number: null,
    position: null,
    positions: [],
    is_minor: false,
    is_head_coach: false,
    coach_title: null,
    display_name: null,
    created_at: "2026-06-26T00:00:00Z",
    coach_upgrade_requested_at: null,
    ...overrides,
  };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("bucketRoster", () => {
  it("a joined player (viewer, no label) is a roster row, not a coach", () => {
    const joined = member({ id: "joined", user_id: "u1", display_name: "Sam" });
    const b = bucketRoster([joined]);
    expect(ids(b.rosterRows)).toEqual(["joined"]);
    expect(b.activeCoaches).toHaveLength(0);
    expect(b.pending).toHaveLength(0);
  });

  it("a tentative joiner (pending) shows in the players table AND the approval queue", () => {
    const t = member({ id: "tent", user_id: "u1", status: "pending", display_name: "Pat" });
    const b = bucketRoster([t]);
    expect(ids(b.rosterRows)).toEqual(["tent"]); // visible as tentative
    expect(ids(b.pending)).toEqual(["tent"]); // also actionable for the coach
  });

  it("an unclaimed coach-added name is a roster row", () => {
    const slot = member({ id: "slot", label: "Jane Doe", jersey_number: "12" });
    const b = bucketRoster([slot]);
    expect(ids(b.rosterRows)).toEqual(["slot"]);
    expect(b.activeCoaches).toHaveLength(0);
  });

  it("a plain coach (editor, no label) is a coach, not a player", () => {
    const coach = member({ id: "coach", role: "editor", user_id: "u9", display_name: "Coach K" });
    const b = bucketRoster([coach]);
    expect(ids(b.activeCoaches)).toEqual(["coach"]);
    expect(b.rosterRows).toHaveLength(0);
  });

  it("REGRESSION: a coach who is ALSO a roster player (editor row WITH a label) stays visible as a player", () => {
    const both = member({
      id: "both",
      role: "editor",
      user_id: "u5",
      label: "Coach Dad",
      display_name: "Coach Dad",
    });
    const b = bucketRoster([both]);
    // Must appear exactly once, in the players table — never dropped.
    expect(ids(b.rosterRows)).toEqual(["both"]);
    expect(b.activeCoaches).toHaveLength(0); // not double-listed as a coach
  });

  it("an owner with a label also stays visible as a player", () => {
    const owner = member({ id: "owner", role: "owner", user_id: "u0", label: "Owner Coach" });
    const b = bucketRoster([owner]);
    expect(ids(b.rosterRows)).toEqual(["owner"]);
  });

  it("a parent-managed slot (label, no user_id, managed_by) is a roster row", () => {
    const managed = member({ id: "kid", label: "Kid A", managed_by: "parent1" });
    const b = bucketRoster([managed]);
    expect(ids(b.rosterRows)).toEqual(["kid"]);
  });

  it("a coach-upgrade request surfaces, and is not a pending-membership", () => {
    const up = member({
      id: "up",
      user_id: "u2",
      status: "active",
      coach_upgrade_requested_at: "2026-06-26T01:00:00Z",
      display_name: "Wants Coach",
    });
    const b = bucketRoster([up]);
    expect(ids(b.coachUpgradeRequests)).toEqual(["up"]);
    expect(b.pending).toHaveLength(0); // active, so not a membership-pending
    expect(ids(b.rosterRows)).toEqual(["up"]); // still a player on the roster
  });

  it("no row is dropped: every active member lands in exactly one of players/coaches", () => {
    const roster = [
      member({ id: "p1", user_id: "u1", display_name: "Joined" }),
      member({ id: "p2", label: "Unclaimed Name" }),
      member({ id: "p3", role: "editor", user_id: "u3", label: "Coach Player" }),
      member({ id: "c1", role: "editor", user_id: "u4" }),
      member({ id: "c2", role: "owner", user_id: "u5" }),
      member({ id: "kid", label: "Kid", managed_by: "u4" }),
    ];
    const b = bucketRoster(roster);
    const shown = new Set([
      ...b.rosterRows.map((r) => r.id),
      ...b.activeCoaches.map((r) => r.id),
    ]);
    // Every active row is rendered somewhere.
    for (const m of roster) expect(shown.has(m.id)).toBe(true);
    // players and coaches don't overlap.
    const playerIds = new Set(b.rosterRows.map((r) => r.id));
    for (const c of b.activeCoaches) expect(playerIds.has(c.id)).toBe(false);
  });

  it("a banned/removed empty roster yields empty buckets (no crash)", () => {
    const b = bucketRoster([]);
    expect(b.rosterRows).toHaveLength(0);
    expect(b.activeCoaches).toHaveLength(0);
    expect(b.players).toHaveLength(0);
    expect(b.pending).toHaveLength(0);
    expect(b.coachUpgradeRequests).toHaveLength(0);
  });
});
