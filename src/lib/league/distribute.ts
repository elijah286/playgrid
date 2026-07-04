import type { SupabaseClient } from "@supabase/supabase-js";

import type { LibraryItem } from "@/lib/league/library";

// Snapshot distribution (Phase 2 of docs/league-platform/LIBRARY-DISTRIBUTION-PLAN.md).
// Copies a library item's CONTENT into a team playbook: a play group lands as
// a new playbook_group + copied plays; a practice plan lands as a new
// practice_plans row. Copies are snapshots — redistribution is ADD-ONLY with
// version-suffixed group names (owner decision 2026-07-03), never mutating
// anything the coach may have edited.
//
// The play-copy steps mirror src/lib/data/playbook-copy.ts (bulk insert,
// index-aligned old→new maps, metadata.playType forced from the DB column).
// One deliberate v1 simplification: formation_id/opponent_formation_id are
// NULLED on the copies — the target playbook doesn't own the source's
// formation rows, and plays render self-contained from their version
// document (formation_name text is preserved for display).

/** "Install 1" → "Install 1 (v2)" → "Install 1 (v3)" against existing names. */
export function nextGroupName(existingNames: string[], title: string): string {
  const taken = new Set(existingNames);
  if (!taken.has(title)) return title;
  for (let v = 2; ; v++) {
    const candidate = `${title} (v${v})`;
    if (!taken.has(candidate)) return candidate;
  }
}

const PLAY_COPY_COLUMNS =
  "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tags, tag, current_version_id, sort_order, play_type, special_teams_unit, vs_play_id, vs_play_snapshot";

export async function distributePlayGroupToPlaybook(
  admin: SupabaseClient,
  item: Pick<LibraryItem, "sourcePlaybookId" | "sourceGroupId" | "title">,
  targetPlaybookId: string,
  userId: string,
): Promise<{ ok: true; groupId: string; playCount: number } | { ok: false; error: string }> {
  if (!item.sourceGroupId) return { ok: false, error: "Not a play group." };

  const [{ data: existingGroups }, playsRes] = await Promise.all([
    admin.from("playbook_groups").select("name").eq("playbook_id", targetPlaybookId),
    admin
      .from("plays")
      .select(PLAY_COPY_COLUMNS)
      .eq("playbook_id", item.sourcePlaybookId)
      .eq("group_id", item.sourceGroupId)
      .eq("is_archived", false)
      .is("deleted_at", null)
      .is("attached_to_play_id", null)
      .order("sort_order", { ascending: true }),
  ]);
  if (playsRes.error) return { ok: false, error: playsRes.error.message };
  const plays = playsRes.data ?? [];
  if (plays.length === 0) return { ok: false, error: "That group has no plays." };

  const groupName = nextGroupName(
    (existingGroups ?? []).map((g) => g.name as string),
    item.title,
  );
  const { data: newGroup, error: gErr } = await admin
    .from("playbook_groups")
    .insert({ playbook_id: targetPlaybookId, name: groupName })
    .select("id")
    .single();
  if (gErr || !newGroup) return { ok: false, error: gErr?.message ?? "Could not create group." };
  const targetGroupId = newGroup.id as string;

  const versionIds = plays
    .map((p) => (p.current_version_id as string | null) ?? null)
    .filter((id): id is string => !!id);
  const versionById = new Map<string, { document: unknown; schema_version: number | null }>();
  if (versionIds.length > 0) {
    const { data: vers } = await admin
      .from("play_versions")
      .select("id, document, schema_version")
      .in("id", versionIds);
    for (const v of vers ?? []) {
      versionById.set(v.id as string, {
        document: v.document,
        schema_version: (v.schema_version as number | null) ?? null,
      });
    }
  }

  const { data: newPlays, error: pErr } = await admin
    .from("plays")
    .insert(
      plays.map((p) => ({
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
        group_id: targetGroupId,
        sort_order: p.sort_order ?? 0,
        play_type: p.play_type ?? "offense",
        special_teams_unit: p.special_teams_unit,
        formation_id: null,
        opponent_formation_id: null,
        vs_play_snapshot: p.vs_play_snapshot,
      })),
    )
    .select("id");
  if (pErr) return { ok: false, error: pErr.message };
  const inserted = newPlays ?? [];
  if (inserted.length !== plays.length) {
    return { ok: false, error: `Inserted ${inserted.length} plays, expected ${plays.length}.` };
  }
  const playIdMap = new Map<string, string>();
  plays.forEach((p, i) => playIdMap.set(p.id as string, inserted[i].id as string));

  const versionRows: Array<Record<string, unknown>> = [];
  for (const p of plays) {
    const src = p.current_version_id ? versionById.get(p.current_version_id as string) : null;
    const newPlayId = playIdMap.get(p.id as string);
    if (!src || !newPlayId) continue;
    const doc = (src.document ?? {}) as Record<string, unknown>;
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    versionRows.push({
      play_id: newPlayId,
      schema_version: src.schema_version ?? 1,
      document: {
        ...doc,
        metadata: {
          ...meta,
          playType: (p.play_type as string | null) ?? "offense",
          specialTeamsUnit: (p.special_teams_unit as string | null) ?? null,
        },
      },
      label: "distributed",
      created_by: userId,
    });
  }
  const versionIdByPlay = new Map<string, string>();
  if (versionRows.length > 0) {
    const { data: newVers, error: vErr } = await admin
      .from("play_versions")
      .insert(versionRows)
      .select("id, play_id");
    if (vErr) return { ok: false, error: vErr.message };
    for (const v of newVers ?? []) versionIdByPlay.set(v.play_id as string, v.id as string);
  }

  const updates: PromiseLike<unknown>[] = [];
  for (const p of plays) {
    const newPlayId = playIdMap.get(p.id as string);
    if (!newPlayId) continue;
    const u: Record<string, string | null> = {};
    const ver = versionIdByPlay.get(newPlayId);
    if (ver) u.current_version_id = ver;
    const oldVs = (p.vs_play_id as string | null) ?? null;
    if (oldVs && playIdMap.has(oldVs)) u.vs_play_id = playIdMap.get(oldVs)!;
    if (Object.keys(u).length > 0) updates.push(admin.from("plays").update(u).eq("id", newPlayId));
  }
  if (updates.length > 0) await Promise.all(updates);

  return { ok: true, groupId: targetGroupId, playCount: plays.length };
}

export async function distributePracticePlanToPlaybook(
  admin: SupabaseClient,
  item: Pick<LibraryItem, "sourcePracticePlanId" | "title">,
  targetPlaybookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!item.sourcePracticePlanId) return { ok: false, error: "Not a practice plan." };

  const { data: srcPlan } = await admin
    .from("practice_plans")
    .select("id, title, current_version_id")
    .eq("id", item.sourcePracticePlanId)
    .maybeSingle();
  if (!srcPlan?.current_version_id) return { ok: false, error: "Source plan has no content yet." };
  const { data: srcVer } = await admin
    .from("practice_plan_versions")
    .select("document, schema_version")
    .eq("id", srcPlan.current_version_id as string)
    .maybeSingle();
  if (!srcVer) return { ok: false, error: "Source plan version missing." };

  const { data: plan, error: planErr } = await admin
    .from("practice_plans")
    .insert({ playbook_id: targetPlaybookId, title: item.title, created_by: userId })
    .select("id")
    .single();
  if (planErr || !plan) return { ok: false, error: planErr?.message ?? "Could not create plan." };
  const { data: version, error: verErr } = await admin
    .from("practice_plan_versions")
    .insert({
      practice_plan_id: plan.id,
      document: srcVer.document,
      schema_version: srcVer.schema_version ?? 1,
      created_by: userId,
    })
    .select("id")
    .single();
  if (verErr || !version) {
    await admin.from("practice_plans").delete().eq("id", plan.id);
    return { ok: false, error: verErr?.message ?? "Could not copy plan content." };
  }
  await admin.from("practice_plans").update({ current_version_id: version.id }).eq("id", plan.id);
  return { ok: true };
}
