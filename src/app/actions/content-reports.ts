"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { validateReportInput, type ReportInput } from "@/lib/moderation/report-types";

/**
 * File a content report (App Store Guideline 1.2). Writes through the
 * security-definer `file_content_report` RPC so the insert shape + length caps
 * are enforced in the database. Works for authenticated users; anonymous
 * viewers of a public shared play are allowed too (reporter_id resolves to
 * NULL server-side).
 */
export async function reportContentAction(
  input: ReportInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Reporting is not available right now." };

  const validationError = validateReportInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("file_content_report", {
    p_content_type: input.contentType,
    p_content_ref: input.contentRef ?? null,
    p_playbook_id: input.playbookId ?? null,
    p_reason: input.reason,
    p_details: input.details ?? null,
    p_reported_text: input.reportedText ?? null,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
