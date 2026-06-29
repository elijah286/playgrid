import { describe, it, expect } from "vitest";
import {
  buildChildMap,
  buildMembershipEdges,
  computeInfluence,
  type MemberRow,
  type ReferralEdge,
} from "./referral-influence";

/**
 * Referral network value — the transitive influence traversal that powers the
 * "most valuable users" view. The forest invariant (each recipient has exactly
 * one referrer, enforced by the UNIQUE recipient_id) means downstream subtrees
 * never merge, so per-level counts and spend are unambiguous.
 */

// A → B, A → C (direct); B → D, B → E (level 2); D → F (level 3).
const EDGES: ReferralEdge[] = [
  { senderId: "A", recipientId: "B" },
  { senderId: "A", recipientId: "C" },
  { senderId: "B", recipientId: "D" },
  { senderId: "B", recipientId: "E" },
  { senderId: "D", recipientId: "F" },
];

const SPEND = new Map<string, number>([
  ["A", 9900],
  ["B", 5000],
  ["C", 0],
  ["D", 2000],
  ["E", 100],
  ["F", 700],
]);

describe("buildChildMap", () => {
  it("groups recipients under each sender", () => {
    const children = buildChildMap(EDGES);
    expect(children.get("A")).toEqual(["B", "C"]);
    expect(children.get("B")).toEqual(["D", "E"]);
    expect(children.get("D")).toEqual(["F"]);
    expect(children.has("F")).toBe(false);
  });

  it("drops self-referral and empty edges", () => {
    const children = buildChildMap([
      { senderId: "X", recipientId: "X" },
      { senderId: "", recipientId: "Y" },
      { senderId: "Z", recipientId: "" },
      { senderId: "X", recipientId: "Y" },
    ]);
    expect(children.get("X")).toEqual(["Y"]);
    expect(children.has("Z")).toBe(false);
  });
});

describe("computeInfluence", () => {
  const children = buildChildMap(EDGES);

  it("counts the full downstream subtree across every level", () => {
    const inf = computeInfluence("A", children, SPEND);
    expect(inf.directReferrals).toBe(2); // B, C
    expect(inf.networkSize).toBe(5); // B, C, D, E, F
  });

  it("sums downstream spend but excludes the root's own spend", () => {
    const inf = computeInfluence("A", children, SPEND);
    // B + C + D + E + F = 5000 + 0 + 2000 + 100 + 700
    expect(inf.networkSpendCents).toBe(7800);
  });

  it("breaks the network down by level", () => {
    const inf = computeInfluence("A", children, SPEND);
    expect(inf.levels).toEqual([
      { level: 1, count: 2, spendCents: 5000 }, // B, C
      { level: 2, count: 2, spendCents: 2100 }, // D, E
      { level: 3, count: 1, spendCents: 700 }, // F
    ]);
  });

  it("returns empty influence for a leaf user with no referrals", () => {
    const inf = computeInfluence("F", children, SPEND);
    expect(inf).toEqual({
      directReferrals: 0,
      networkSize: 0,
      networkSpendCents: 0,
      levels: [],
    });
  });

  it("reports a mid-tree user's own subtree, not the whole forest", () => {
    const inf = computeInfluence("B", children, SPEND);
    expect(inf.directReferrals).toBe(2); // D, E
    expect(inf.networkSize).toBe(3); // D, E, F
    expect(inf.networkSpendCents).toBe(2800); // 2000 + 100 + 700
  });

  it("treats a missing spend entry as zero", () => {
    const inf = computeInfluence("A", children, new Map());
    expect(inf.networkSpendCents).toBe(0);
    expect(inf.networkSize).toBe(5);
  });

  it("does not infinite-loop on a cyclic edge set", () => {
    const cyclic = buildChildMap([
      { senderId: "A", recipientId: "B" },
      { senderId: "B", recipientId: "A" },
    ]);
    const inf = computeInfluence("A", cyclic, new Map([["B", 500]]));
    // B is reached once; A is the root and never re-counted.
    expect(inf.networkSize).toBe(1);
    expect(inf.networkSpendCents).toBe(500);
  });
});

describe("buildMembershipEdges", () => {
  function m(p: Partial<MemberRow>): MemberRow {
    return { playbook_id: "pb1", user_id: "u", role: "viewer", ...p };
  }

  it("emits owner→member edges for non-owner joiners", () => {
    const edges = buildMembershipEdges([
      m({ user_id: "coach", role: "owner" }),
      m({ user_id: "p1", role: "viewer" }),
      m({ user_id: "p2", role: "editor" }),
    ]);
    expect(edges).toEqual([
      { senderId: "coach", recipientId: "p1" },
      { senderId: "coach", recipientId: "p2" },
    ]);
  });

  it("never makes the owner refer themselves", () => {
    const edges = buildMembershipEdges([
      m({ user_id: "coach", role: "owner" }),
    ]);
    expect(edges).toEqual([]);
  });

  it("skips name-only roster rows (no user account)", () => {
    const edges = buildMembershipEdges([
      m({ user_id: "coach", role: "owner" }),
      m({ user_id: null, role: "viewer" }),
    ]);
    expect(edges).toEqual([]);
  });

  it("credits each owner when a playbook has co-owners", () => {
    const edges = buildMembershipEdges([
      m({ user_id: "coachA", role: "owner" }),
      m({ user_id: "coachB", role: "owner" }),
      m({ user_id: "p1", role: "viewer" }),
    ]);
    expect(edges).toEqual([
      { senderId: "coachA", recipientId: "p1" },
      { senderId: "coachB", recipientId: "p1" },
    ]);
  });

  it("ignores members of playbooks with no recorded owner", () => {
    const edges = buildMembershipEdges([
      m({ playbook_id: "pbX", user_id: "p1", role: "viewer" }),
    ]);
    expect(edges).toEqual([]);
  });
});

describe("membership joins count toward a coach's referral network", () => {
  it("a joined player shows up as a direct referral, deduped across playbooks", () => {
    // Coach owns two playbooks; player p1 joined both, p2 joined one.
    const memberEdges = buildMembershipEdges([
      { playbook_id: "pb1", user_id: "coach", role: "owner" },
      { playbook_id: "pb1", user_id: "p1", role: "viewer" },
      { playbook_id: "pb2", user_id: "coach", role: "owner" },
      { playbook_id: "pb2", user_id: "p1", role: "viewer" },
      { playbook_id: "pb2", user_id: "p2", role: "viewer" },
    ]);
    // Plus a copy-link referral edge from the same coach.
    const linkEdges: ReferralEdge[] = [
      { senderId: "coach", recipientId: "p3" },
    ];
    const children = buildChildMap([...memberEdges, ...linkEdges]);
    const inf = computeInfluence(
      "coach",
      children,
      new Map([
        ["p1", 999],
        ["p2", 0],
        ["p3", 1999],
      ]),
    );
    // p1 counted once despite joining two playbooks; p2 and p3 each once.
    expect(inf.directReferrals).toBe(3);
    expect(inf.networkSize).toBe(3);
    expect(inf.networkSpendCents).toBe(999 + 0 + 1999);
  });
});
