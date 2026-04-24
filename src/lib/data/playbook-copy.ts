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
      "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tags, tag, current_version_id, group_id, sort_order, play_type, special_teams_unit, formation_id, opponent_formation_id, vs_play_id, vs_play_snapshot",
    )
    .eq("playbook_id", sourcePlaybookId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  // Clone every formation owned by the source playbook into the target.
  // After the move to playbook-scoped formations, formations don't travel
  // implicitly with the team — we must copy them alongside the plays.
  const formationIdMap = await copySourcePlaybookFormations(
    sourcePlaybookId,
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
    const oldOppFormationId = (p.opponent_formation_id as string | null) ?? null;
    const newOpponentFormationId = oldOppFormationId
      ? formationIdMap.get(oldOppFormationId) ?? null
      : null;
    const oldFormationId = (p.formation_id as string | null) ?? null;
    const newFormationId = oldFormationId
      ? formationIdMap.get(oldFormationId) ?? null
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
        formation_id: newFormationId,
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

}

/**
 * Clone every formation owned by the source playbook into the target
 * playbook and return the old→new id map. Formations are now
 * playbook-scoped, so duplicating a playbook must duplicate its
 * formations alongside its plays; nothing is shared implicitly.
 *
 * Uses the service role so a coach duplicating another team's playbook
 * (allowed via allow_coach_duplication) can still read and clone the
 * source's formations — the anon client can't SELECT rows from a
 * playbook they don't own.
 */
async function copySourcePlaybookFormations(
  sourcePlaybookId: string,
  targetPlaybookId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const svc = createServiceRoleClient();

  const { data: rows } = await svc
    .from("formations")
    .select("id, semantic_key, params, kind")
    .eq("playbook_id", sourcePlaybookId);

  for (const f of rows ?? []) {
    const fid = f.id as string;
    const { data: newF } = await svc
      .from("formations")
      .insert({
        playbook_id: targetPlaybookId,
        is_seed: false,
        semantic_key: `copied_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
 * Copy game results (sessions + per-call rows + score events) from one
 * playbook into another. Caller is responsible for verifying:
 *   * the source playbook's allow_game_results_duplication is true
 *   * the duplicating user explicitly opted in (UI prompt)
 *
 * Only ended sessions are copied — active sessions belong to a live
 * game in progress and have no place in a static duplicate.
 *
 * play_id references on game_plays are translated through the play
 * id map produced by copyPlaybookContents. We re-query plays for that
 * map by joining old play ids to the new playbook by name (cheap and
 * good enough for the v1 prompted flow). game_score_events.play_id
 * points at game_plays.id and is translated through the call id map
 * built inline below. Coach attribution (game_sessions.coach_id and
 * game_score_events.created_by) is rewritten to the duplicating user
 * so cross-team copies don't leak third-party identities.
 */
export async function copyPlaybookGameSessions(
  client: SupabaseClient,
  sourcePlaybookId: string,
  targetPlaybookId: string,
  duplicatingUserId: string,
): Promise<void> {
  const { data: sessions } = await client
    .from("game_sessions")
    .select(
      "id, started_at, ended_at, kind, opponent, score_us, score_them, notes",
    )
    .eq("playbook_id", sourcePlaybookId)
    .eq("status", "ended")
    .order("started_at", { ascending: true });
  if (!sessions || sessions.length === 0) return;

  // Build old-play-id → new-play-id map by name. The duplicate copies
  // every non-archived play and preserves names, so this resolves the
  // vast majority of historical calls. Calls that don't resolve are
  // dropped — game_plays.play_id is NOT NULL, so we can't preserve
  // them without a target play row.
  const playIdMap = await buildSourceToTargetPlayMap(
    client,
    sourcePlaybookId,
    targetPlaybookId,
  );

  for (const s of sessions) {
    const sourceSessionId = s.id as string;
    const { data: newSession } = await client
      .from("game_sessions")
      .insert({
        playbook_id: targetPlaybookId,
        coach_id: duplicatingUserId,
        status: "ended",
        started_at: s.started_at,
        ended_at: s.ended_at,
        kind: s.kind,
        opponent: s.opponent,
        score_us: s.score_us,
        score_them: s.score_them,
        notes: s.notes,
      })
      .select("id")
      .single();
    if (!newSession?.id) continue;
    const newSessionId = newSession.id as string;

    const { data: calls } = await client
      .from("game_plays")
      .select(
        "id, play_id, position, called_at, thumb, tag, snapshot, play_version_id",
      )
      .eq("session_id", sourceSessionId)
      .order("position", { ascending: true });

    const callIdMap = new Map<string, string>();
    for (const c of calls ?? []) {
      const newPlayId = playIdMap.get(c.play_id as string);
      if (!newPlayId) continue;
      const { data: newCall } = await client
        .from("game_plays")
        .insert({
          session_id: newSessionId,
          play_id: newPlayId,
          // Don't carry version_id across — it points at a row in the
          // source's play_versions tree which the duplicate doesn't
          // own. The snapshot is the authoritative render source.
          play_version_id: null,
          position: c.position,
          called_at: c.called_at,
          thumb: c.thumb,
          tag: c.tag,
          snapshot: c.snapshot ?? {},
        })
        .select("id")
        .single();
      if (newCall?.id) callIdMap.set(c.id as string, newCall.id as string);
    }

    const { data: events } = await client
      .from("game_score_events")
      .select("side, delta, created_at, play_id")
      .eq("session_id", sourceSessionId)
      .order("created_at", { ascending: true });
    if (events && events.length > 0) {
      const rows = events.map((e) => ({
        session_id: newSessionId,
        created_by: duplicatingUserId,
        side: e.side,
        delta: e.delta,
        created_at: e.created_at,
        play_id: e.play_id ? callIdMap.get(e.play_id as string) ?? null : null,
      }));
      await client.from("game_score_events").insert(rows);
    }
  }
}

async function buildSourceToTargetPlayMap(
  client: SupabaseClient,
  sourcePlaybookId: string,
  targetPlaybookId: string,
): Promise<Map<string, string>> {
  const [{ data: src }, { data: tgt }] = await Promise.all([
    client
      .from("plays")
      .select("id, name")
      .eq("playbook_id", sourcePlaybookId),
    client
      .from("plays")
      .select("id, name")
      .eq("playbook_id", targetPlaybookId),
  ]);
  const tgtByName = new Map<string, string>();
  for (const t of tgt ?? []) {
    const name = (t.name as string | null)?.trim();
    if (name) tgtByName.set(name, t.id as string);
  }
  const map = new Map<string, string>();
  for (const s of src ?? []) {
    const name = (s.name as string | null)?.trim();
    if (!name) continue;
    const newId = tgtByName.get(name);
    if (newId) map.set(s.id as string, newId);
  }
  return map;
}
