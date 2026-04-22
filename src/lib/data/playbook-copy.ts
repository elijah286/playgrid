import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deep-copy everything under a playbook (groups, plays, each play's
 * current version document, plus defense↔offense and opponent-formation
 * linkage) from one playbook to another. Caller has already created
 * the target playbook row and its owner membership.
 *
 * What is copied:
 *   * playbook_groups rows (name, sort_order) — group_id pointers on
 *     plays are translated through an old→new map.
 *   * Non-archived plays, including group_id, sort_order, play_type,
 *     special_teams_unit, tags, wristband/shorthand metadata.
 *   * vs_play_id (defense→offense link) — translated through an
 *     old→new play-id map so the linkage survives inside the copy.
 *     Plays are inserted in two passes so the map is fully built before
 *     the self-references are written.
 *   * vs_play_snapshot — copied verbatim (it's a frozen snapshot jsonb).
 *   * opponent_formation_id — copied verbatim. Formations are scoped to
 *     a team, not a playbook; for same-team duplicates this stays
 *     valid, for cross-team duplicates the reference dangles outside
 *     the target team's formation library. Proper cross-team formation
 *     duplication is a separate flow.
 *   * Each play's current_version_id document (preserving schema_version).
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
      "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tags, tag, current_version_id, group_id, sort_order, play_type, special_teams_unit, opponent_formation_id, vs_play_id, vs_play_snapshot",
    )
    .eq("playbook_id", sourcePlaybookId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  // Pass 1: insert every play, remember the old→new id mapping. vs_play_id
  // is nulled out here because its target may not exist yet in the copy.
  const playIdMap = new Map<string, string>();
  const pendingVsLinks: Array<{ newPlayId: string; oldVsPlayId: string }> = [];

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
        opponent_formation_id: p.opponent_formation_id,
        vs_play_snapshot: p.vs_play_snapshot,
        // vs_play_id resolved in pass 2 below.
      })
      .select("id")
      .single();
    if (!newPlay?.id) continue;

    const newPlayId = newPlay.id as string;
    playIdMap.set(p.id as string, newPlayId);

    const oldVs = (p.vs_play_id as string | null) ?? null;
    if (oldVs) pendingVsLinks.push({ newPlayId, oldVsPlayId: oldVs });

    if (p.current_version_id) {
      const { data: srcVer } = await client
        .from("play_versions")
        .select("document, schema_version")
        .eq("id", p.current_version_id)
        .maybeSingle();
      if (srcVer) {
        const { data: newVer } = await client
          .from("play_versions")
          .insert({
            play_id: newPlayId,
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
            .eq("id", newPlayId);
        }
      }
    }
  }

  // Pass 2: wire up the defense→offense links inside the copy now that
  // every play exists and we have the full id map. Links whose target
  // play was archived (and therefore skipped above) stay null.
  for (const link of pendingVsLinks) {
    const newTargetId = playIdMap.get(link.oldVsPlayId);
    if (!newTargetId) continue;
    await client
      .from("plays")
      .update({ vs_play_id: newTargetId })
      .eq("id", link.newPlayId);
  }
}
