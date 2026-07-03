import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Per-user monthly cap on image attachments to Coach Cal. Flat for now —
 *  no purchasable packs. Tunable here in one place; the route handler and
 *  the chat client both read this. */
export const COACH_AI_IMAGE_MONTHLY_LIMIT = 10;

export type CoachCalImageCapState = {
  count: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  /** First day of next month (YYYY-MM-DD UTC). What the meter calls "reset". */
  resetDate: string;
};

/** Single source of truth for "is this user out of Coach Cal image uploads
 *  right now". Mirrors the shape of getCoachCalCapState but on the
 *  image_count column. */
export async function getCoachCalImageCapState(userId: string): Promise<CoachCalImageCapState> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStr = monthStart.toISOString().slice(0, 10);
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const resetDate = nextMonth.toISOString().slice(0, 10);

  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("coach_ai_usage")
    .select("image_count")
    .eq("user_id", userId)
    .eq("month", monthStr)
    .maybeSingle();

  const count = (data?.image_count as number | null) ?? 0;
  const limit = COACH_AI_IMAGE_MONTHLY_LIMIT;
  const remaining = Math.max(0, limit - count);

  return {
    count,
    limit,
    remaining,
    exceeded: count >= limit,
    resetDate,
  };
}

/**
 * Record one image processed against the monthly cap. Read-modify-write
 * (not atomic) is acceptable here: the counter is a soft cost guard on a
 * single user's own sequential actions, not billing truth — the token
 * ledger in coach_ai_token_usage carries the real spend. Best-effort:
 * never throws, so a counting failure can't break the import itself.
 */
export async function recordCoachCalImageUsed(userId: string): Promise<void> {
  try {
    const now = new Date();
    const monthStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("coach_ai_usage")
      .select("image_count")
      .eq("user_id", userId)
      .eq("month", monthStr)
      .maybeSingle();
    const next = ((data?.image_count as number | null) ?? 0) + 1;
    await admin
      .from("coach_ai_usage")
      .upsert(
        { user_id: userId, month: monthStr, image_count: next },
        { onConflict: "user_id,month" },
      );
  } catch (err) {
    console.warn(
      `[photo-import] failed to record image usage for ${userId}: ${err instanceof Error ? err.message : err}`,
    );
  }
}
