import "server-only";

import { createClient } from "@/lib/supabase/server";
import { standardSeedDivisions } from "./divisionCatalog";

/**
 * Seed the standard Co-ed division set for a league.
 *
 * Idempotent: existing live segments (matched on gender + age_group) are skipped,
 * so it's safe to call on league creation AND from the "Add standard divisions"
 * recovery action on the divisions page. Relies on the caller already having
 * admin rights — inserts go through RLS as the signed-in user.
 */
export async function seedStandardDivisions(
  leagueId: string,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<{ inserted: number; error?: string }> {
  const supabase = client ?? (await createClient());

  const { data: existing } = await supabase
    .from("league_divisions")
    .select("gender, age_group")
    .eq("league_id", leagueId)
    .not("age_group", "is", null)
    .is("archived_at", null);

  const have = new Set((existing ?? []).map((r) => `${r.gender}:${r.age_group}`));

  const toInsert = standardSeedDivisions()
    .filter((d) => !have.has(`${d.gender}:${d.ageGroup}`))
    .map((d) => ({
      league_id: leagueId,
      name: d.name,
      gender: d.gender,
      age_group: d.ageGroup,
      sort_order: d.sortOrder,
      active: true,
    }));

  if (toInsert.length === 0) return { inserted: 0 };

  const { error } = await supabase.from("league_divisions").insert(toInsert);
  if (error) return { inserted: 0, error: error.message };
  return { inserted: toInsert.length };
}
