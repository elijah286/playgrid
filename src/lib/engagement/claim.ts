import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimum gap between any two interruptive engagement asks. */
export const ENGAGEMENT_COOLDOWN_DAYS = 14;

export function engagementCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - ENGAGEMENT_COOLDOWN_DAYS * 86400000).toISOString();
}

/**
 * Atomically reserve the engagement slot for this user, returning true only to
 * the caller that won it.
 *
 * This is a single conditional UPDATE on purpose. Postgres takes a row lock,
 * then re-evaluates the WHERE against the freshly committed version, so of two
 * racing callers exactly one matches and the other gets zero rows back. That is
 * what makes a double-ask impossible by construction.
 *
 * The predecessor — read last_engagement_prompt_at, decide, then write it —
 * could not do this. Both the rating nudge and the referral announcement
 * mounted in the same layout and read the stamp concurrently, before either had
 * written it; both saw null, both passed, and a coach got both asks. The
 * cooldown only ever suppressed the second ask on a *later* load. Do not
 * reintroduce a read-then-write here: the check and the stamp must stay one
 * statement.
 */
export async function claimEngagementSlot(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("profiles")
      .update({ last_engagement_prompt_at: now.toISOString() })
      .eq("id", userId)
      .or(
        `last_engagement_prompt_at.is.null,last_engagement_prompt_at.lt.${engagementCutoffIso(now)}`,
      )
      .select("id");
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    // Never let a failed reservation surface an ask — silence is the safe side.
    return false;
  }
}

/** Read-side mirror of the claim predicate, for eligibility checks that must
 *  not stamp anything. Kept next to the claim so the two can't drift. */
export function isWithinEngagementCooldown(
  lastAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastAt) return false;
  return new Date(lastAt).getTime() > new Date(engagementCutoffIso(now)).getTime();
}
