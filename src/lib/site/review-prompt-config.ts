import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-suggest-reviews";

export type SuggestReviews = "everyone" | "only_admins" | "off";

const fetchSuggestReviews = unstable_cache(
  async (): Promise<SuggestReviews> => {
    try {
      const admin = createServiceRoleClient();
      const { data } = await admin
        .from("site_settings")
        .select("suggest_reviews")
        .eq("id", SITE_ROW_ID)
        .maybeSingle();
      const val = (data as { suggest_reviews?: string } | null)?.suggest_reviews;
      if (val === "everyone" || val === "off") return val;
      return "only_admins";
    } catch {
      return "only_admins";
    }
  },
  [CACHE_TAG],
  { tags: [CACHE_TAG], revalidate: 60 },
);

export async function getSuggestReviews(): Promise<SuggestReviews> {
  return fetchSuggestReviews();
}

export async function setSuggestReviews(value: SuggestReviews): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .update({ suggest_reviews: value })
    .eq("id", SITE_ROW_ID);
  if (error) throw new Error(error.message);
}
