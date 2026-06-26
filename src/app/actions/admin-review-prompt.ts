"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getSuggestReviews,
  setSuggestReviews,
  type SuggestReviews,
} from "@/lib/site/review-prompt-config";

export async function getSuggestReviewsAction(): Promise<
  { ok: true; value: SuggestReviews } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv())
    return { ok: false, error: "Supabase is not configured." };
  try {
    const value = await getSuggestReviews();
    return { ok: true, value };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load setting.",
    };
  }
}

export async function setSuggestReviewsAction(
  value: SuggestReviews,
): Promise<{ ok: true; value: SuggestReviews } | { ok: false; error: string }> {
  if (!hasSupabaseEnv())
    return { ok: false, error: "Supabase is not configured." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role?: string } | null)?.role !== "admin") {
    return { ok: false, error: "Forbidden." };
  }

  try {
    await setSuggestReviews(value);
    revalidatePath("/", "layout");
    return { ok: true, value };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
}

/**
 * Clears the current admin's rating-prompt state so they can re-trigger and
 * re-test the nudge flow from scratch. Admin-only; no effect on other users.
 */
export async function resetRatingPromptForSelfAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv())
    return { ok: false, error: "Supabase is not configured." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role?: string } | null)?.role !== "admin") {
    return { ok: false, error: "Forbidden." };
  }

  const { createServiceRoleClient } = await import("@/lib/supabase/admin");
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .update({ rating_triggers_fired: [], rating_prompt_shown_at: null })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
