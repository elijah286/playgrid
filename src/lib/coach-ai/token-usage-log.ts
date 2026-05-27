import { createServiceRoleClient } from "@/lib/supabase/admin";
import { costMicros, isPricedModel, type TokenUsage } from "./token-cost";

// Cal call-site identifier. Lets the admin view break spend down by
// where it came from (chat vs. the expensive Opus vision pipeline).
export type UsageContext =
  | "chat"
  | "vision_pass"
  | "layout_detection"
  | "diagram_crop";

export type RecordTokenUsageArgs = {
  userId: string;
  modelId: string;
  usage: TokenUsage;
  context: UsageContext;
};

/**
 * Best-effort write of one Cal-turn worth of usage. NEVER throws — Cal
 * turns must not fail because logging the cost row failed. Errors are
 * logged so they show up in Cloud Run grep, but the caller proceeds.
 */
export async function recordTokenUsage(args: RecordTokenUsageArgs): Promise<void> {
  try {
    const cost = costMicros(args.modelId, args.usage);
    if (!isPricedModel(args.modelId)) {
      console.warn(
        `[coach-ai:token-usage] unpriced model — modelId=${args.modelId} ` +
          `context=${args.context} input=${args.usage.input_tokens} ` +
          `output=${args.usage.output_tokens} (row will be cost_micros=0)`,
      );
    }
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("coach_ai_token_usage").insert({
      user_id: args.userId,
      model_id: args.modelId,
      context: args.context,
      input_tokens: args.usage.input_tokens,
      output_tokens: args.usage.output_tokens,
      cache_read_input_tokens: args.usage.cache_read_input_tokens,
      cache_creation_input_tokens: args.usage.cache_creation_input_tokens,
      cost_micros: cost,
    });
    if (error) {
      console.warn(
        `[coach-ai:token-usage] insert failed — ${error.message} ` +
          `modelId=${args.modelId} context=${args.context}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[coach-ai:token-usage] unexpected error — ${msg}`);
  }
}
