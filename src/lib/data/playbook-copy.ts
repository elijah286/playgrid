import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Deep-copy everything under a playbook from one playbook to another.
 * Caller has already created the target playbook row and its owner
 * membership.
 *
 * What is copied:
 *   * playbook_groups rows (name, sort_order) — group_id pointers on
 *     plays are translated through an old→new map.
 *   * Non-archived plays, including group_id, sort_order, play_type,
 *     special_teams_unit, tags, wristband/shorthand metadata.
 *   * Team formations referenced via plays.opponent_formation_id — the
 *     source team's formation rows are inserted under the target team
 *     so the duplicate's formation picker and opponent-overlay keep
 *     working. System formations are shared globally; their ids stay
 *     the same.
 *   * opponent_formation_id — translated through the formation map.
 *   * vs_play_id (defense→offense link) — translated through an
 *     old→new play-id map so the linkage survives inside the copy.
 *     Plays are inserted in two passes so the map is fully built
 *     before the self-references are written.
 *   * vs_play_snapshot — copied verbatim (frozen snapshot jsonb).
 *   * playbook_formation_exclusions — the source playbook's "removed"
 *     formations are carried over so the duplicate's available
 *     formation pool matches the source's.
 *   * Each play's current_version_id document (preserving schema_version).
 *
 * Formation reads/writes go through the service-role client so this
 * works for both same-team and cross-team duplicates regardless of
 * which client the caller is using.
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

  const formationIdMap = await copyReferencedFormations(
    plays ?? [],
    targetPlaybookId,
  );

  // Pass 1: insert every play, remember the old→new id mapping. vs_play_id
  // is nulled out here because its target may not exist yet in the copy.
  const playIdMap = new Map<string, string>();
  const pendingVsLinks: Array<{ newPlayId: string; oldVsPlayId: string }> = [];

  for (const p of plays ?? []) {
    const oldGroupId = (p.group_id as string | null) ?? null;
    const newGroupId = oldGroupId
      ? groupIdMap.get(oldGroupId) ?? null
      : null;
    const oldFormationId = (p.opponent_formation_id as string | null) ?? null;
    const newOpponentFormationId = oldFormationId
      ? formationIdMap.get(oldFormationId) ?? oldFormationId
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
        opponent_formation_id: newOpponentFormationId,
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
        // Force the copied document's metadata.playType and
        // metadata.specialTeamsUnit to match the source play's DB columns.
        // Source data in the wild has drift — a defense play whose document
        // metadata still says "offense" from an older authoring pass. If we
        // copied the document verbatim, the next save on the copy would
        // write metadata.playType back to plays.play_type and flip the row.
        const srcDoc = (srcVer.document ?? {}) as Record<string, unknown>;
        const srcMeta = (srcDoc.metadata ?? {}) as Record<string, unknown>;
        const copiedDoc: Record<string, unknown> = {
          ...srcDoc,
          metadata: {
            ...srcMeta,
            playType: (p.play_type as string | null) ?? "offense",
            specialTeamsUnit: (p.special_teams_unit as string | null) ?? null,
          },
        };
        const { data: newVer } = await client
          .from("play_versions")
          .insert({
            play_id: newPlayId,
            schema_version: (srcVer.schema_version as number | null) ?? 1,
            document: copiedDoc,
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

  await copyFormationExclusions(
    sourcePlaybookId,
    targetPlaybookId,
    formationIdMap,
  );
}

type PlayWithRefs = {
  opponent_formation_id?: string | null;
};

/**
 * For each non-system formation referenced by a source play, insert a
 * copy under the target playbook's team and return the old→new id map.
 * System formations are shared globally; their ids pass through.
 *
 * Uses the service role so a coach duplicating another team's playbook
 * (allowed via allow_coach_duplication) still gets the opponent
 * formations copied into their own team — the anon client can't SELECT
 * rows from a team they don't own.
 */
async function copyReferencedFormations(
  plays: PlayWithRefs[],
  targetPlaybookId: string,
): Promise<Map<string, string>> {
  const referenced = new Set<string>();
  for (const p of plays) {
    const fid = (p.opponent_formation_id as string | null) ?? null;
    if (fid) referenced.add(fid);
  }
  const map = new Map<string, string>();
  if (referenced.size === 0) return map;

  const svc = createServiceRoleClient();

  const { data: targetBook } = await svc
    .from("playbooks")
    .select("team_id")
    .eq("id", targetPlaybookId)
    .maybeSingle();
  const targetTeamId = (targetBook?.team_id as string | null) ?? null;
  if (!targetTeamId) return map;

  const { data: rows } = await svc
    .from("formations")
    .select("id, team_id, is_system, semantic_key, params, kind")
    .in("id", Array.from(referenced));

  for (const f of rows ?? []) {
    const fid = f.id as string;
    if (f.is_system === true) {
      // System formations are visible to everyone; reuse the id as-is.
      map.set(fid, fid);
      continue;
    }
    if (f.team_id === targetTeamId) {
      // Already in the target team's library.
      map.set(fid, fid);
      continue;
    }
    const { data: newF } = await svc
      .from("formations")
      .insert({
        team_id: targetTeamId,
        is_system: false,
        semantic_key: f.semantic_key,
        params: f.params,
        kind: f.kind,
      })
      .select("id")
      .single();
    if (newF?.id) map.set(fid, newF.id as string);
  }
  return map;
}

/**
 * Carry the source playbook's formation exclusions into the duplicate so
 * its available-formations pool matches the source's. Exclusions that
 * point at formations we copied get their formation_id translated;
 * exclusions on system formations keep the same formation_id.
 */
async function copyFormationExclusions(
  sourcePlaybookId: string,
  targetPlaybookId: string,
  formationIdMap: Map<string, string>,
): Promise<void> {
  const svc = createServiceRoleClient();
  const { data: excl } = await svc
    .from("playbook_formation_exclusions")
    .select("formation_id")
    .eq("playbook_id", sourcePlaybookId);
  if (!excl || excl.length === 0) return;

  const rows = excl
    .map((r) => {
      const oldId = r.formation_id as string;
      const newId = formationIdMap.get(oldId) ?? oldId;
      return { playbook_id: targetPlaybookId, formation_id: newId };
    })
    // De-dupe in case two source formations collapsed to the same target id.
    .filter(
      (row, i, arr) =>
        arr.findIndex((r) => r.formation_id === row.formation_id) === i,
    );

  await svc
    .from("playbook_formation_exclusions")
    .upsert(rows, { onConflict: "playbook_id,formation_id" });
}
