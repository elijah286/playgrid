import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type LlmProvider = "openai" | "claude";

export const DEFAULT_LLM_PROVIDER: LlmProvider = "claude";

export function isLlmProvider(v: unknown): v is LlmProvider {
  return v === "openai" || v === "claude";
}

/** Server-only: returns the active chat provider, defaulting to claude. */
export async function getLlmProvider(): Promise<LlmProvider> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("site_settings")
    .select("llm_provider")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const v = data?.llm_provider;
  return isLlmProvider(v) ? v : DEFAULT_LLM_PROVIDER;
}

export async function setLlmProvider(provider: LlmProvider): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .update({ llm_provider: provider, updated_at: new Date().toISOString() })
    .eq("id", SITE_ROW_ID);
  if (error) throw new Error(error.message);
}
