import { describe, it, expect } from "vitest";
import {
  buildChildMap,
  computeInfluence,
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
