/**
 * The engagement-ask ladder: every interruptive "ask" a coach can receive that
 * isn't a blocking gate (terms, name capture) or product education (the native
 * welcome spotlight).
 *
 * There is exactly ONE of these on screen at a time, at most once per
 * ENGAGEMENT_COOLDOWN_DAYS, and never during a coach's first moments in a
 * session. Selection is pure and lives here so it can be tested without a DB;
 * the atomic reservation that enforces "one at a time" lives in claim.ts.
 */

export type EngagementAskKind = "referral_announcement" | "rating";

/**
 * Higher wins when several asks are eligible on the same load.
 *
 * The referral announcement outranks the rating nudge because it is a true
 * one-shot (a coach can only ever be told once that the program launched),
 * whereas the rating nudge recurs on a 365-day cooldown and loses nothing by
 * waiting for the next window.
 */
export const ENGAGEMENT_ASK_PRIORITY: Record<EngagementAskKind, number> = {
  referral_announcement: 100,
  rating: 50,
};

/**
 * Pick the ask to show from those whose own eligibility already passed.
 * Deterministic: ties are impossible (priorities are distinct), and an empty
 * list yields null rather than a default.
 */
export function selectEngagementAsk(
  eligible: readonly EngagementAskKind[],
): EngagementAskKind | null {
  let best: EngagementAskKind | null = null;
  for (const kind of eligible) {
    if (best === null || ENGAGEMENT_ASK_PRIORITY[kind] > ENGAGEMENT_ASK_PRIORITY[best]) {
      best = kind;
    }
  }
  return best;
}
