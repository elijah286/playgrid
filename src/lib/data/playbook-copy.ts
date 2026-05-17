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
  // Source reads go through the service role so cross-team copies work
  // (claim-from-link, example claim) — the caller may not be a member of
  // the source playbook, and RLS would silently return empty arrays for
  // every source SELECT, leaving the recipient with an empty claimed
  // playbook. Target writes stay on the user client so ownership and
  // attribution still flow through RLS.
  //
  // Bulk-insert shape: previously each play cost 2–4 round-trips (insert
  // play + maybe select version + insert version + update version
  // pointer). A 53-play playbook took 15–20s. The pass below collapses
  // the whole copy into ~5 wallclock round-trips: parallel source reads,
  // one bulk insert per table, and a single parallel update batch for
  // back-pointers (current_version_id, vs_play_id). PostgREST guarantees
  // that `.insert(rows).select()` returns rows in input order, so the
  // index-aligned zip from source → target is safe.
  const src = createServiceRoleClient();

  // 1) Read all source data + start cloning formations in parallel.
  //    Formations are written to the target inside this helper but it's
  //    independent of plays/groups, so it overlaps the reads.
  const [groupsRes, playsRes, formationIdMap] = await Promise.all([
    src
      .from("playbook_groups")
      .select("id, name, sort_order")
      .eq("playbook_id", sourcePlaybookId)
      .order("sort_order", { ascending: true }),
    src
      .from("plays")
      .select(
        "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tags, tag, current_version_id, group_id, sort_order, play_type, special_teams_unit, formation_id, opponent_formation_id, vs_play_id, vs_play_snapshot",
      )
      .eq("playbook_id", sourcePlaybookId)
      .eq("is_archived", false)
      .is("deleted_at", null)
      .is("attached_to_play_id", null)
      .order("sort_order", { ascending: true }),
    copySourcePlaybookFormations(sourcePlaybookId, targetPlaybookId),
  ]);
  if (groupsRes.error) throw new Error(`copy: read groups: ${groupsRes.error.message}`);
  if (playsRes.error) throw new Error(`copy: read plays: ${playsRes.error.message}`);
  const groups = groupsRes.data ?? [];
  const plays = playsRes.data ?? [];

  // 2) Fetch all referenced play_versions in one round-trip.
  const versionIds = plays
    .map((p) => (p.current_version_id as string | null) ?? null)
    .filter((id): id is string => !!id);
  const versionById = new Map<
    string,
    { document: unknown; schema_version: number | null }
  >();
  if (versionIds.length > 0) {
    const { data: vers, error: verErr } = await src
      .from("play_versions")
      .select("id, document, schema_version")
      .in("id", versionIds);
    if (verErr) throw new Error(`copy: read play_versions: ${verErr.message}`);
    for (const v of vers ?? []) {
      versionById.set(v.id as string, {
        document: v.document,
        schema_version: (v.schema_version as number | null) ?? null,
      });
    }
  }

  // 3) Bulk insert groups. PostgREST returns rows in input order so we
  //    zip source[i] → inserted[i] to build the old→new id map.
  const groupIdMap = new Map<string, string>();
  if (groups.length > 0) {
    const { data: newGroups, error: gErr } = await client
      .from("playbook_groups")
      .insert(
        groups.map((g) => ({
          playbook_id: targetPlaybookId,
          name: g.name,
          sort_order: g.sort_order,
        })),
      )
      .select("id");
    if (gErr) throw new Error(`copy: insert groups: ${gErr.message}`);
    const inserted = newGroups ?? [];
    if (inserted.length !== groups.length) {
      throw new Error(
        `copy: inserted ${inserted.length} groups, expected ${groups.length}`,
      );
    }
    groups.forEach((g, i) => {
      groupIdMap.set(g.id as string, inserted[i].id as string);
    });
  }

  if (plays.length === 0) return;

  // 4) Bulk insert plays. vs_play_id and current_version_id are deferred
  //    to step 6 — vs_play_id points at sibling plays in the same copy
  //    (forward refs), and current_version_id points at rows we haven't
  //    created yet (step 5).
  const { data: newPlays, error: pErr } = await client
    .from("plays")
    .insert(
      plays.map((p) => {
        const oldGroupId = (p.group_id as string | null) ?? null;
        const oldOppFormationId =
          (p.opponent_formation_id as string | null) ?? null;
        const oldFormationId = (p.formation_id as string | null) ?? null;
        return {
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
          group_id: oldGroupId ? groupIdMap.get(oldGroupId) ?? null : null,
          sort_order: p.sort_order ?? 0,
          play_type: p.play_type ?? "offense",
          special_teams_unit: p.special_teams_unit,
          formation_id: oldFormationId
            ? formationIdMap.get(oldFormationId) ?? null
            : null,
          opponent_formation_id: oldOppFormationId
            ? formationIdMap.get(oldOppFormationId) ?? null
            : null,
          vs_play_snapshot: p.vs_play_snapshot,
        };
      }),
    )
    .select("id");
  if (pErr) throw new Error(`copy: insert plays: ${pErr.message}`);
  const insertedPlays = newPlays ?? [];
  if (insertedPlays.length !== plays.length) {
    throw new Error(
      `copy: inserted ${insertedPlays.length} plays, expected ${plays.length}`,
    );
  }
  const playIdMap = new Map<string, string>();
  plays.forEach((p, i) => {
    playIdMap.set(p.id as string, insertedPlays[i].id as string);
  });

  // 5) Bulk insert play_versions. Force the document's metadata.playType
  //    and specialTeamsUnit to match the source play's DB columns —
  //    source data in the wild has drift (e.g. a defense play whose
  //    document metadata still says "offense" from an older authoring
  //    pass); copying verbatim would cause the next save on the copy to
  //    write metadata.playType back to plays.play_type and flip the row.
  const versionInsertRows: Array<{
    play_id: string;
    schema_version: number;
    document: Record<string, unknown>;
    label: string;
    created_by: string;
  }> = [];
  for (const p of plays) {
    const oldVerId = p.current_version_id as string | null;
    if (!oldVerId) continue;
    const srcVer = versionById.get(oldVerId);
    if (!srcVer) continue;
    const newPlayId = playIdMap.get(p.id as string);
    if (!newPlayId) continue;
    const srcDoc = (srcVer.document ?? {}) as Record<string, unknown>;
    const srcMeta = (srcDoc.metadata ?? {}) as Record<string, unknown>;
    versionInsertRows.push({
      play_id: newPlayId,
      schema_version: srcVer.schema_version ?? 1,
      document: {
        ...srcDoc,
        metadata: {
          ...srcMeta,
          playType: (p.play_type as string | null) ?? "offense",
          specialTeamsUnit: (p.special_teams_unit as string | null) ?? null,
        },
      },
      label: "copied",
      created_by: createdByUserId,
    });
  }
  const versionIdByPlayId = new Map<string, string>();
  if (versionInsertRows.length > 0) {
    const { data: newVers, error: vErr } = await client
      .from("play_versions")
      .insert(versionInsertRows)
      .select("id, play_id");
    if (vErr) throw new Error(`copy: insert play_versions: ${vErr.message}`);
    for (const v of newVers ?? []) {
      versionIdByPlayId.set(v.play_id as string, v.id as string);
    }
  }

  // 6) Back-pointer updates: current_version_id + vs_play_id. Combined
  //    into one row per play so each play needs at most one UPDATE, then
  //    issued in parallel. Defense→offense links whose target was
  //    archived (and therefore skipped above) stay null.
  const updatePromises: PromiseLike<unknown>[] = [];
  for (const p of plays) {
    const newPlayId = playIdMap.get(p.id as string);
    if (!newPlayId) continue;
    const updates: Record<string, string | null> = {};
    const newVerId = versionIdByPlayId.get(newPlayId);
    if (newVerId) updates.current_version_id = newVerId;
    const oldVs = (p.vs_play_id as string | null) ?? null;
    if (oldVs) {
      const newVs = playIdMap.get(oldVs);
      if (newVs) updates.vs_play_id = newVs;
    }
    if (Object.keys(updates).length === 0) continue;
    updatePromises.push(
      client.from("plays").update(updates).eq("id", newPlayId),
    );
  }
  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
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
 *
 * Single bulk insert (rather than per-row) — PostgREST returns rows in
 * input order so we zip source[i] → inserted[i] to build the map. The
 * semantic_key suffix mixes the source id so distinct source formations
 * never collide in the unique index, even when batched in the same ms.
 */
async function copySourcePlaybookFormations(
  sourcePlaybookId: string,
  targetPlaybookId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const svc = createServiceRoleClient();

  const { data: rows, error: readErr } = await svc
    .from("formations")
    .select("id, semantic_key, params, kind")
    .eq("playbook_id", sourcePlaybookId);
  if (readErr) throw new Error(`copy: read formations: ${readErr.message}`);
  const sourceFormations = rows ?? [];
  if (sourceFormations.length === 0) return map;

  const stamp = Date.now();
  const { data: newRows, error: insErr } = await svc
    .from("formations")
    .insert(
      sourceFormations.map((f) => ({
        playbook_id: targetPlaybookId,
        is_seed: false,
        semantic_key: `copied_${stamp}_${Math.random()
          .toString(36)
          .slice(2, 10)}_${(f.id as string).slice(0, 8)}`,
        params: f.params,
        kind: f.kind,
      })),
    )
    .select("id");
  if (insErr) throw new Error(`copy: insert formations: ${insErr.message}`);
  const inserted = newRows ?? [];
  if (inserted.length !== sourceFormations.length) {
    throw new Error(
      `copy: inserted ${inserted.length} formations, expected ${sourceFormations.length}`,
    );
  }
  sourceFormations.forEach((f, i) => {
    map.set(f.id as string, inserted[i].id as string);
  });
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
  // Same rule as copyPlaybookContents: source reads via service role so
  // claim-from-link recipients (non-members of source) get real data
  // instead of silently empty results from RLS. Target writes stay on
  // the user client.
  const src = createServiceRoleClient();

  const { data: sessions } = await src
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

    const { data: calls } = await src
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

    const { data: events } = await src
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

/**
 * Count active (non-retired) playbook KB notes attached to a playbook.
 * Used by the duplicate dialog to decide whether to surface the
 * "also copy notes?" checkbox at all — empty playbooks shouldn't
 * show an option that can't do anything.
 */
export async function countPlaybookKbNotes(
  client: SupabaseClient,
  playbookId: string,
): Promise<number> {
  const { count } = await client
    .from("rag_documents")
    .select("id", { count: "exact", head: true })
    .eq("scope", "playbook")
    .eq("scope_id", playbookId)
    .is("retired_at", null);
  return count ?? 0;
}

/**
 * Copy active playbook KB notes (rag_documents with scope='playbook')
 * from one playbook into another.
 *
 * Uses the service-role client so cross-team duplicates work — RLS
 * would otherwise block reads from a playbook the duplicating user
 * doesn't own. The caller is responsible for verifying the user is
 * authorized to duplicate (the duplicate flow already checks this via
 * playbooks.allow_coach_duplication / allow_player_duplication).
 *
 * Notes are copied with:
 *   * scope_id rewritten to the target playbook
 *   * source preserved (e.g. coach_chat) and source_note prefixed with
 *     "(copied from playbook ${sourcePlaybookId})" so provenance survives
 *   * sport_variant / game_level / sanctioning_body / age_division
 *     pulled from the TARGET playbook in case the duplicate sits in a
 *     different league (otherwise retrieval-time variant filters would
 *     hide the imported notes)
 *   * created_by rewritten to the duplicating user (so the new copies
 *     don't leak the source coach's identity inside the new playbook)
 *   * retired_at NOT copied (we already excluded retired notes via the
 *     query) and revisions NOT copied (the duplicate starts a fresh
 *     change log — historical edits belong to the source playbook)
 *
 * Embeddings are reused as-is — they're a function of (title, content),
 * which we copy verbatim, so re-embedding would be a waste of OpenAI calls.
 */
export async function copyPlaybookKb(
  sourcePlaybookId: string,
  targetPlaybookId: string,
  duplicatingUserId: string,
): Promise<{ copied: number }> {
  const svc = createServiceRoleClient();

  const [{ data: notes }, { data: targetMeta }] = await Promise.all([
    svc
      .from("rag_documents")
      .select(
        "topic, subtopic, title, content, source, source_url, source_note, authoritative, needs_review, embedding",
      )
      .eq("scope", "playbook")
      .eq("scope_id", sourcePlaybookId)
      .is("retired_at", null),
    svc
      .from("playbooks")
      .select("sport_variant, game_level, sanctioning_body, age_division")
      .eq("id", targetPlaybookId)
      .maybeSingle(),
  ]);

  if (!notes || notes.length === 0) return { copied: 0 };

  const provenancePrefix = `(copied from playbook ${sourcePlaybookId}) `;
  const rows = notes.map((n) => ({
    scope: "playbook",
    scope_id: targetPlaybookId,
    topic: n.topic,
    subtopic: n.subtopic,
    title: n.title,
    content: n.content,
    sport_variant: targetMeta?.sport_variant ?? null,
    game_level: targetMeta?.game_level ?? null,
    sanctioning_body: targetMeta?.sanctioning_body ?? null,
    age_division: targetMeta?.age_division ?? null,
    source: n.source,
    source_url: n.source_url,
    source_note: n.source_note ? `${provenancePrefix}${n.source_note}` : provenancePrefix.trim(),
    authoritative: n.authoritative,
    needs_review: n.needs_review,
    created_by: duplicatingUserId,
    embedding: n.embedding,
  }));

  const { data: inserted, error } = await svc
    .from("rag_documents")
    .insert(rows)
    .select("id, title, content, source, source_url, source_note, authoritative, needs_review");
  if (error) throw new Error(`copy playbook KB: ${error.message}`);

  // Seed each new doc with revision 1 so the change log has a starting
  // point and future edits get a clean rev-2 with no gap.
  if (inserted && inserted.length > 0) {
    const revRows = inserted.map((d) => ({
      document_id: d.id,
      revision_number: 1,
      title: d.title,
      content: d.content,
      source: d.source,
      source_url: d.source_url,
      source_note: d.source_note,
      authoritative: d.authoritative,
      needs_review: d.needs_review,
      change_kind: "create",
      change_summary: "Copied from source playbook on duplication.",
      changed_by: duplicatingUserId,
    }));
    const { error: revErr } = await svc.from("rag_document_revisions").insert(revRows);
    if (revErr) throw new Error(`copy playbook KB revisions: ${revErr.message}`);
  }

  return { copied: inserted?.length ?? 0 };
}

async function buildSourceToTargetPlayMap(
  client: SupabaseClient,
  sourcePlaybookId: string,
  targetPlaybookId: string,
): Promise<Map<string, string>> {
  // Source-side read via service role so claim-from-link recipients
  // (non-members of source) get the real play list. Target-side read
  // stays on the caller's client.
  const svc = createServiceRoleClient();
  const [{ data: srcRows }, { data: tgt }] = await Promise.all([
    svc
      .from("plays")
      .select("id, name")
      .eq("playbook_id", sourcePlaybookId)
      .is("deleted_at", null),
    client
      .from("plays")
      .select("id, name")
      .eq("playbook_id", targetPlaybookId)
      .is("deleted_at", null),
  ]);
  const tgtByName = new Map<string, string>();
  for (const t of tgt ?? []) {
    const name = (t.name as string | null)?.trim();
    if (name) tgtByName.set(name, t.id as string);
  }
  const map = new Map<string, string>();
  for (const s of srcRows ?? []) {
    const name = (s.name as string | null)?.trim();
    if (!name) continue;
    const newId = tgtByName.get(name);
    if (newId) map.set(s.id as string, newId);
  }
  return map;
}

/**
 * Copy team-chat history from one playbook to another. Used by the
 * "duplicate playbook" flow when the user opts into "Also copy message
 * history". Off by default — message history rarely makes sense to carry
 * across to a fresh copy.
 *
 * Author identity is preserved: the original `author_id` stays on each row
 * so attributions still read "Coach Smith said …" even if the new playbook
 * has a different roster. The author's profile reference is by `profiles.id`
 * (a profile, not a membership), so the foreign key still resolves whether
 * or not the original author has been invited to the duplicate.
 *
 * Soft-deleted rows are copied verbatim so the chronology and tombstones
 * survive the duplication. The owner of the duplicate can clear them later
 * via the "Clear all messages" action if they want a fresh slate.
 */
export async function copyPlaybookMessages(
  sourcePlaybookId: string,
  targetPlaybookId: string,
): Promise<{ copied: number }> {
  const svc = createServiceRoleClient();

  const { data: rows, error: srcErr } = await svc
    .from("playbook_messages")
    .select("author_id, body, created_at, edited_at, deleted_at, deleted_by")
    .eq("playbook_id", sourcePlaybookId)
    .order("created_at", { ascending: true });
  if (srcErr) throw new Error(`copy playbook messages: ${srcErr.message}`);
  if (!rows || rows.length === 0) return { copied: 0 };

  const insertRows = rows.map((r) => ({
    playbook_id: targetPlaybookId,
    author_id: r.author_id,
    body: r.body,
    created_at: r.created_at,
    edited_at: r.edited_at,
    deleted_at: r.deleted_at,
    deleted_by: r.deleted_by,
  }));

  const { error } = await svc.from("playbook_messages").insert(insertRows);
  if (error) throw new Error(`copy playbook messages: ${error.message}`);
  return { copied: insertRows.length };
}
