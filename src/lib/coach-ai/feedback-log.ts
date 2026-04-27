import { createClient } from "@/lib/supabase/server";

/**
 * Append a row to public.coach_ai_kb_misses via the security-definer RPC.
 *
 * The RPC silently no-ops when the calling user has not opted in
 * (profiles.ai_feedback_optin is null/false), so callers can always
 * invoke this without a separate check. Failures are propagated so the
 * caller can decide how to respond — the agent loop swallows them so
 * a logging hiccup never breaks a chat reply.
 */
export async function logCoachAiKbMiss(args: {
  topic: string;
  userQuestion: string;
  reason: string;
  playbookId: string | null;
  sportVariant: string | null;
  sanctioningBody: string | null;
  gameLevel: string | null;
  ageDivision: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_coach_ai_kb_miss", {
    p_topic: args.topic,
    p_user_question: args.userQuestion,
    p_reason: args.reason,
    p_playbook_id: args.playbookId,
    p_sport_variant: args.sportVariant,
    p_sanctioning_body: args.sanctioningBody,
    p_game_level: args.gameLevel,
    p_age_division: args.ageDivision,
  });
  if (error) throw new Error(error.message);
}
