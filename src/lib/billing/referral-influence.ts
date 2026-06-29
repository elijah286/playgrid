// Referral influence — the transitive value of a user's referral network.
//
// The `referral_awards` table records one edge per claimed copy-link:
// (sender_id → recipient_id), with `recipient_id` UNIQUE (a recipient can
// only ever be awarded once — see 0193_referral_rewards.sql). That uniqueness
// makes the referral graph a FOREST: every user has at most one referrer, so
// each user's downstream is a clean tree with no diamond merges.
//
// "How influential is this user?" then has a precise answer: walk their
// subtree. Level 1 is the people who signed up because of them; level 2 is the
// people who signed up because of *those* people; and so on. Summing the
// lifetime spend of every node in the subtree gives the dollar value the user
// generated for the business beyond their own wallet.
//
// This module is pure (no DB, no Stripe) so the traversal is unit-testable in
// isolation from the action that feeds it edges + a spend map.

export type ReferralEdge = {
  senderId: string;
  recipientId: string;
};

export type NetworkLevel = {
  /** Distance from the root: 1 = direct referral, 2 = referral-of-referral, … */
  level: number;
  /** Number of users at this depth. */
  count: number;
  /** Summed lifetime spend (cents) of the users at this depth. */
  spendCents: number;
};

export type NetworkInfluence = {
  /** Users at level 1 — signed up directly because of this user. */
  directReferrals: number;
  /** Every downstream user across all levels (excludes the root itself). */
  networkSize: number;
  /** Summed lifetime spend (cents) of the entire downstream network. */
  networkSpendCents: number;
  /** Per-level breakdown, level 1..N, omitting empty trailing levels. */
  levels: NetworkLevel[];
};

/**
 * Adjacency map sender → recipients, built from the raw award edges.
 * Self-edges (sender === recipient) are dropped as nonsensical.
 */
export function buildChildMap(
  edges: readonly ReferralEdge[],
): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const { senderId, recipientId } of edges) {
    if (!senderId || !recipientId || senderId === recipientId) continue;
    const list = children.get(senderId);
    if (list) list.push(recipientId);
    else children.set(senderId, [recipientId]);
  }
  return children;
}

const EMPTY_INFLUENCE: NetworkInfluence = {
  directReferrals: 0,
  networkSize: 0,
  networkSpendCents: 0,
  levels: [],
};

/**
 * Walk the subtree rooted at `rootId` breadth-first, accumulating per-level
 * counts and spend. A `visited` set (seeded with the root) guards against the
 * pathological cycle the schema technically permits (A→B, B→A) and against a
 * user appearing twice — each downstream user is counted exactly once, at the
 * shallowest depth it's reached.
 */
export function computeInfluence(
  rootId: string,
  children: Map<string, string[]>,
  spendByUserCents: Map<string, number>,
): NetworkInfluence {
  const directChildren = children.get(rootId);
  if (!directChildren || directChildren.length === 0) return EMPTY_INFLUENCE;

  const visited = new Set<string>([rootId]);
  const levels: NetworkLevel[] = [];
  let networkSize = 0;
  let networkSpendCents = 0;

  let frontier = directChildren;
  let depth = 1;
  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    let count = 0;
    let spendCents = 0;
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      count += 1;
      spendCents += spendByUserCents.get(id) ?? 0;
      const kids = children.get(id);
      if (kids) nextFrontier.push(...kids);
    }
    if (count > 0) {
      levels.push({ level: depth, count, spendCents });
      networkSize += count;
      networkSpendCents += spendCents;
    }
    frontier = nextFrontier;
    depth += 1;
  }

  return {
    directReferrals: levels[0]?.count ?? 0,
    networkSize,
    networkSpendCents,
    levels,
  };
}
