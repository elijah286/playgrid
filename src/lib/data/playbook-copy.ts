import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deep-copy everything under a playbook (groups, plays, and each play's
 * current version document) from one playbook to another. Caller has
 * already created the target playbook row and its owner membership.
 *
 * What is copied:
 *   * playbook_groups rows (name, sort_order) — group_id pointers on
 *     plays are translated through an old→new map.
 *   * Non-archived plays, including group_id, sort_order, play_type,
 *     special_teams_unit, tags, wristband/shorthand metadata.
 *   * Each play's current_version_id document (preserving schema_version).
 *
 * What is NOT copied (references that would cross into the source
 * playbook's scope and need their own translation first):
 *   * plays.vs_play_id / vs_play_snapshot — defense→offense link lives
 *     in the source playbook; re-linking is a manual step.
 *   * plays.opponent_formation_id — points into the source playbook's
 *     formations; duplicating formations is a separate flow.
 */
export async function copyPlaybookContents(
  client: SupabaseClient,
  sourcePlaybookId: string,
  targetPlaybookId: string,
  createdByUserId: string,
): Promise<void> {
  const { data: groups } = await client
    .from("playbook_groups")
    .select("id, name, sort_order")
    .eq("playbook_id", sourcePlaybookId)
    .order("sort_order", { ascending: true });

  const groupIdMap = new Map<string, string>();
  for (const g of groups ?? []) {
    const { data: newGroup } = await client
      .from("playbook_groups")
      .insert({
        playbook_id: targetPlaybookId,
        name: g.name,
        sort_order: g.sort_order,
      })
      .select("id")
      .single();
    if (newGroup?.id) {
      groupIdMap.set(g.id as string, newGroup.id as string);
    }
  }

  const { data: plays } = await client
    .from("plays")
    .select(
      "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tags, tag, current_version_id, group_id, sort_order, play_type, special_teams_unit",
    )
    .eq("playbook_id", sourcePlaybookId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  for (const p of plays ?? []) {
    const oldGroupId = (p.group_id as string | null) ?? null;
    const newGroupId = oldGroupId
      ? groupIdMap.get(oldGroupId) ?? null
      : null;

    const { data: newPlay } = await client
      .from("plays")
      .insert({
        playbook_id: targetPlaybookId,
        name: p.name,
        shorthand: p.shorthand,
        wristband_code: p.wristband_code,
        mnemonic: p.mnemonic,
        display_abbrev: p.display_abbrev,
        formation_name: p.formation_name,
        concept: p.concept,
        tags: p.tags ?? (p.tag ? [p.tag] : []),
        tag: p.tag,
        group_id: newGroupId,
        sort_order: p.sort_order ?? 0,
        play_type: p.play_type ?? "offense",
        special_teams_unit: p.special_teams_unit,
      })
      .select("id")
      .single();
    if (!newPlay?.id) continue;

    if (!p.current_version_id) continue;
    const { data: srcVer } = await client
      .from("play_versions")
      .select("document, schema_version")
      .eq("id", p.current_version_id)
      .maybeSingle();
    if (!srcVer) continue;

    const { data: newVer } = await client
      .from("play_versions")
      .insert({
        play_id: newPlay.id,
        schema_version: (srcVer.schema_version as number | null) ?? 1,
        document: srcVer.document,
        label: "copied",
        created_by: createdByUserId,
      })
      .select("id")
      .single();
    if (newVer?.id) {
      await client
        .from("plays")
        .update({ current_version_id: newVer.id })
        .eq("id", newPlay.id);
    }
  }
}
