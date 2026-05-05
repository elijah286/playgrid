"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ensureDefaultWorkspace, getOrCreateInboxPlaybook } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createEmptyPlayDocument, defaultDefendersForVariant, defaultPlayersForVariant, generateOtherVariantPlayers, normalizePlayDocument, sportProfileForVariant } from "@/domain/play/factory";
import type { PlayDocument, Player, PlayType, Route, SpecialTeamsUnit, SportVariant, VsPlaySnapshot, Zone } from "@/domain/play/types";
import { normalizePlaybookSettings, type PlaybookSettings } from "@/domain/playbook/settings";
import {
  compareNavPlays,
  type PlaybookGroupRow,
  type PlaybookPlayNavItem,
} from "@/domain/print/playbookPrint";
import { getPlaybookOwnerEntitlement, getPlaybookOwnerId } from "@/lib/billing/owner-entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { assertNotLocked, computeDowngradeLocks } from "@/lib/billing/downgrade-locks";
import {
  assertNoActiveGameSession,
  gameModeLockedResult,
} from "@/lib/game-mode/assert-no-active-session";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { recordPlayVersion } from "@/lib/versions/play-version-writer";
import { recordPlaybookVersion } from "@/lib/versions/playbook-version-writer";
import { timed } from "@/lib/perf/timed";

async function assertPlayCap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playbookId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerEnt = await getPlaybookOwnerEntitlement(playbookId);
  if (tierAtLeast(ownerEnt, "coach")) return { ok: true };
  const limit = await getFreeMaxPlaysPerPlaybook();
  const { count } = await supabase
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId)
    .eq("is_archived", false)
    .is("attached_to_play_id", null);
  if ((count ?? 0) >= limit) {
    return {
      ok: false,
      error: `Free tier is capped at ${limit} plays per playbook. Upgrade to Team Coach for unlimited plays.`,
    };
  }
  return { ok: true };
}

/**
 * Returns true if the signed-in user has created at least one play in a
 * playbook they own (excluding the auto-created default workspace). Used to
 * gate the feedback widget so brand-new users don't see it until they've
 * engaged with the product.
 */
export async function userHasCreatedPlayAction(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: owned } = await supabase
    .from("playbook_members")
    .select("playbook_id, playbooks!inner(is_default)")
    .eq("user_id", user.id)
    .eq("role", "owner");
  const ownedIds = (owned ?? [])
    .filter((r) => {
      const pb = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
      return pb && !pb.is_default;
    })
    .map((r) => r.playbook_id as string);
  if (ownedIds.length === 0) return false;

  const { count } = await supabase
    .from("plays")
    .select("id", { count: "exact", head: true })
    .in("playbook_id", ownedIds)
    .eq("is_archived", false)
    .is("attached_to_play_id", null)
    .limit(1);
  return (count ?? 0) > 0;
}

export type PlaybookDetailPlayRow = {
  id: string;
  name: string;
  wristband_code: string | null;
  shorthand: string | null;
  concept: string | null;
  formation_name: string | null;
  tags: string[];
  group_id: string | null;
  sort_order: number;
  updated_at: string | null;
  is_archived: boolean;
  play_type: PlayType;
  special_teams_unit: SpecialTeamsUnit | null;
  preview: {
    players: Player[];
    routes: Route[];
    zones: Zone[];
    lineOfScrimmageY: number;
  } | null;
  hasNotes: boolean;
};

const PLAYS_LIST_CAP = 2000;

export async function listPlaysAction(
  playbookId: string,
  opts?: { includeArchived?: boolean },
): Promise<
  | { ok: true; plays: PlaybookDetailPlayRow[]; groups: PlaybookGroupRow[]; truncated: boolean }
  | {
      ok: false;
      error: string;
      plays: PlaybookDetailPlayRow[];
      groups: PlaybookGroupRow[];
      truncated: boolean;
    }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured.", plays: [], groups: [], truncated: false };
  }
  const supabase = await createClient();
  // No explicit user check — RLS scopes visible plays to members + public
  // examples, so anon visitors viewing a published example see its plays.

  let playsQ = supabase
    .from("plays")
    .select(
      "id, name, wristband_code, shorthand, concept, formation_name, tags, tag, group_id, sort_order, updated_at, current_version_id, is_archived, play_type, special_teams_unit",
    )
    .eq("playbook_id", playbookId)
    .is("deleted_at", null)
    .is("attached_to_play_id", null)
    .order("updated_at", { ascending: false })
    .limit(PLAYS_LIST_CAP + 1);

  if (!opts?.includeArchived) playsQ = playsQ.eq("is_archived", false);

  const [playsRes, groupsRes] = await timed(
    `listPlays:plays+groups pb=${playbookId}`,
    () =>
      Promise.all([
        timed(`listPlays:plays-select pb=${playbookId}`, () => playsQ),
        timed(`listPlays:groups-select pb=${playbookId}`, () =>
          supabase
            .from("playbook_groups")
            .select("id, name, sort_order")
            .eq("playbook_id", playbookId)
            .is("deleted_at", null)
            .order("sort_order", { ascending: true }),
        ),
      ]),
  );

  if (playsRes.error)
    return { ok: false, error: playsRes.error.message, plays: [], groups: [], truncated: false };
  if (groupsRes.error)
    return { ok: false, error: groupsRes.error.message, plays: [], groups: [], truncated: false };

  const allRows = playsRes.data ?? [];
  const truncated = allRows.length > PLAYS_LIST_CAP;
  const rawRows = truncated ? allRows.slice(0, PLAYS_LIST_CAP) : allRows;
  const versionIds = rawRows
    .map((r) => r.current_version_id as string | null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const previewByVersion = new Map<
    string,
    { players: Player[]; routes: Route[]; zones: Zone[]; lineOfScrimmageY: number }
  >();
  const notesByVersion = new Map<string, boolean>();
  if (versionIds.length > 0) {
    // jsonb-path select pulls only the slices the thumbnail actually
    // renders, instead of the full PlayDocument blob. ~21% fewer bytes
    // off the wire + cheaper JSON parse vs. fetching `document` and
    // throwing most of it away client-side. The full doc lives in
    // play_versions for editor reads; the listing path doesn't need it.
    const { data: versions } = await timed(
      `listPlays:versions-select n=${versionIds.length} pb=${playbookId}`,
      () =>
        supabase
          .from("play_versions")
          .select(
            "id, players:document->layers->players, routes:document->layers->routes, zones:document->layers->zones, los:document->lineOfScrimmageY, notes:document->metadata->notes",
          )
          .in("id", versionIds),
    );
    for (const v of (versions ?? []) as Array<{
      id: string;
      players: Player[] | null;
      routes: Route[] | null;
      zones: Zone[] | null;
      los: number | null;
      notes: string | null;
    }>) {
      previewByVersion.set(v.id, {
        players: v.players ?? [],
        routes: v.routes ?? [],
        zones: v.zones ?? [],
        lineOfScrimmageY: typeof v.los === "number" ? v.los : 0.4,
      });
      notesByVersion.set(
        v.id,
        typeof v.notes === "string" && v.notes.trim().length > 0,
      );
    }
  }

  const plays: PlaybookDetailPlayRow[] = rawRows.map((r) => {
    const tagsArr = Array.isArray(r.tags) ? (r.tags as string[]) : [];
    const legacy = typeof r.tag === "string" && r.tag.trim().length > 0 ? [r.tag.trim()] : [];
    const vid = r.current_version_id as string | null;
    return {
      id: r.id as string,
      name: r.name as string,
      wristband_code: (r.wristband_code as string | null) ?? null,
      shorthand: (r.shorthand as string | null) ?? null,
      concept: (r.concept as string | null) ?? null,
      formation_name: (r.formation_name as string | null) ?? null,
      tags: tagsArr.length > 0 ? tagsArr : legacy,
      group_id: (r.group_id as string | null) ?? null,
      sort_order: (r.sort_order as number | null) ?? 0,
      updated_at: (r.updated_at as string | null) ?? null,
      is_archived: Boolean(r.is_archived),
      play_type: ((r.play_type as PlayType | null) ?? "offense"),
      special_teams_unit: (r.special_teams_unit as SpecialTeamsUnit | null) ?? null,
      preview: vid ? previewByVersion.get(vid) ?? null : null,
      hasNotes: vid ? notesByVersion.get(vid) ?? false : false,
    };
  });

  return {
    ok: true,
    plays,
    groups: (groupsRes.data ?? []) as PlaybookGroupRow[],
    truncated,
  };
}

export async function createPlayAction(
  playbookId: string,
  opts?: {
    initialPlayers?: Player[];
    formationId?: string | null;
    formationName?: string;
    playerCount?: number;
    variant?: SportVariant;
    playType?: PlayType;
    specialTeamsUnit?: SpecialTeamsUnit | null;
    playName?: string;
  },
) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const ownerId = await getPlaybookOwnerId(playbookId);
  if (ownerId) {
    const lock = await assertNotLocked({ ownerId, playbookId });
    if (!lock.ok) return { ok: false as const, error: lock.error };
  }

  const gameLock = await assertNoActiveGameSession(supabase, playbookId);
  if (gameLock.locked) return gameModeLockedResult(gameLock.lock);

  const cap = await assertPlayCap(supabase, playbookId);
  if (!cap.ok) return { ok: false as const, error: cap.error };

  // Use the playbook's variant to drive both sport profile and default players.
  const effectiveVariant: SportVariant = opts?.variant ?? "flag_7v7";
  const sportProfile = sportProfileForVariant(effectiveVariant);
  const players: Player[] =
    opts?.initialPlayers ??
    defaultPlayersForVariant(effectiveVariant, opts?.playerCount);

  const doc = createEmptyPlayDocument({
    sportProfile,
    layers: { players, routes: [], annotations: [] },
  });

  // Patch metadata with formation link + play type
  doc.metadata.formationId = opts?.formationId ?? null;
  doc.metadata.formation = opts?.formationName ?? "";
  doc.metadata.playType = opts?.playType ?? "offense";
  doc.metadata.specialTeamsUnit = opts?.specialTeamsUnit ?? null;
  if (opts?.playName && opts.playName.trim()) {
    doc.metadata.coachName = opts.playName.trim();
  }
  const { data: sortRow } = await supabase
    .from("plays")
    .select("sort_order")
    .eq("playbook_id", playbookId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (sortRow?.sort_order ?? -1) + 1;

  // Auto-assign next sequential wristband code for this playbook. Only considers
  // codes that are pure integers (so manual tags like "HOT" don't break numbering).
  const { data: codeRows } = await supabase
    .from("plays")
    .select("wristband_code")
    .eq("playbook_id", playbookId);
  const maxCode = (codeRows ?? [])
    .map((r) => parseInt((r.wristband_code as string | null) ?? "", 10))
    .filter((n): n is number => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0);
  const nextCode = String(maxCode + 1).padStart(2, "0");
  doc.metadata.wristbandCode = nextCode;

  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: playbookId,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      concept: "",
      tags: doc.metadata.tags,
      tag: doc.metadata.tags[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      sort_order: nextSort,
      formation_id: opts?.formationId ?? null,
      formation_tag: null,
      play_type: opts?.playType ?? "offense",
      special_teams_unit: opts?.specialTeamsUnit ?? null,
    })
    .select("id")
    .single();

  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 2,
      document: doc as unknown as Record<string, unknown>,
      label: "v1",
      created_by: user.id,
      kind: "create",
    })
    .select("id")
    .single();

  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", play.id);

  return { ok: true as const, playId: play.id, versionId: ver.id };
}

export async function getPlayForEditorAction(playId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  // No auth gate — RLS scopes which plays the caller can see, including
  // the anon-accessible rows on public example playbooks.

  const { data: play, error } = await supabase
    .from("plays")
    .select(
      "id, playbook_id, name, wristband_code, shorthand, concept, tags, tag, formation_name, current_version_id, formation_id, formation_tag, play_type, special_teams_unit, opponent_formation_id, vs_play_id, vs_play_snapshot, attached_to_play_id, opponent_hidden, is_archived",
    )
    .eq("id", playId)
    .single();

  if (error || !play) return { ok: false as const, error: error?.message ?? "Not found" };

  if (!play.current_version_id) {
    return { ok: false as const, error: "Play has no saved version." };
  }

  const { data: ver, error: vErr } = await supabase
    .from("play_versions")
    .select("id, document, label, created_at, parent_version_id")
    .eq("id", play.current_version_id)
    .single();

  if (vErr || !ver) return { ok: false as const, error: vErr?.message ?? "Version missing" };

  const normalizedDoc = normalizePlayDocument(ver.document as PlayDocument);

  // Backfill formation link + play type from plays row if not already in document
  const docWithLink: PlayDocument = {
    ...normalizedDoc,
    metadata: {
      ...normalizedDoc.metadata,
      formationId: normalizedDoc.metadata.formationId ?? ((play.formation_id as string | null) ?? null),
      formationTag: normalizedDoc.metadata.formationTag ?? ((play.formation_tag as string | null) ?? null),
      // plays.play_type / plays.special_teams_unit are the source of truth
      // (NOT NULL columns, set at create and by dedicated actions). The
      // document metadata is a denormalized mirror and is known to drift
      // in older data. Trust the DB on load so the editor never surfaces
      // a stale type — and never writes a stale type back on save.
      playType: (play.play_type as PlayType | null) ?? normalizedDoc.metadata.playType ?? "offense",
      specialTeamsUnit:
        (play.special_teams_unit as SpecialTeamsUnit | null) ??
        normalizedDoc.metadata.specialTeamsUnit ??
        null,
      opponentFormationId:
        normalizedDoc.metadata.opponentFormationId ?? ((play.opponent_formation_id as string | null) ?? null),
      vsPlayId:
        normalizedDoc.metadata.vsPlayId ?? ((play.vs_play_id as string | null) ?? null),
      vsPlaySnapshot:
        normalizedDoc.metadata.vsPlaySnapshot ??
        ((play.vs_play_snapshot as VsPlaySnapshot | null) ?? null),
    },
  };

  // Detect a hidden custom-opponent child attached to this play. The parent
  // links to it via vs_play_id, but the editor needs to know whether the
  // opposing-side players come from a hidden play (drag-editable) vs a
  // regular standalone play (read-only mirror).
  let customOpponentPlayId: string | null = null;
  if (play.vs_play_id) {
    const { data: linked } = await supabase
      .from("plays")
      .select("id, attached_to_play_id")
      .eq("id", play.vs_play_id as string)
      .maybeSingle();
    if (linked && (linked.attached_to_play_id as string | null) === play.id) {
      customOpponentPlayId = linked.id as string;
    }
  }

  return {
    ok: true as const,
    play,
    version: ver,
    document: docWithLink,
    customOpponentPlayId,
    opponentHidden: Boolean(play.opponent_hidden),
  };
}

export async function savePlayVersionAction(
  playId: string,
  document: PlayDocument,
  label?: string,
  note?: string | null,
) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: play, error: pErr } = await supabase
    .from("plays")
    .select("id, playbook_id, current_version_id, play_type, special_teams_unit")
    .eq("id", playId)
    .single();
  if (pErr || !play) return { ok: false as const, error: pErr?.message ?? "Not found" };

  const ownerId = await getPlaybookOwnerId(play.playbook_id as string);
  if (ownerId) {
    const lock = await assertNotLocked({
      ownerId,
      playbookId: play.playbook_id as string,
      playId: play.id as string,
    });
    if (!lock.ok) return { ok: false as const, error: lock.error };
  }

  const gameLock = await assertNoActiveGameSession(
    supabase,
    play.playbook_id as string,
  );
  if (gameLock.locked) return gameModeLockedResult(gameLock.lock);

  // Drop stale FKs: if the linked formation or opponent play was deleted,
  // writing the stored UUID back to plays fails the FK. Verify they exist
  // and scrub both the document metadata and the columns below.
  let formationId = document.metadata.formationId ?? null;
  let opponentFormationId = document.metadata.opponentFormationId ?? null;
  let vsPlayId = document.metadata.vsPlayId ?? null;

  if (formationId) {
    const { data: f } = await supabase
      .from("formations")
      .select("id")
      .eq("id", formationId)
      .maybeSingle();
    if (!f) formationId = null;
  }
  if (opponentFormationId) {
    const { data: f } = await supabase
      .from("formations")
      .select("id")
      .eq("id", opponentFormationId)
      .maybeSingle();
    if (!f) opponentFormationId = null;
  }
  if (vsPlayId) {
    const { data: p } = await supabase
      .from("plays")
      .select("id")
      .eq("id", vsPlayId)
      .maybeSingle();
    if (!p) vsPlayId = null;
  }

  const sanitizedDoc: PlayDocument = {
    ...document,
    metadata: {
      ...document.metadata,
      formationId,
      formationTag: formationId ? document.metadata.formationTag ?? null : null,
      opponentFormationId,
      vsPlayId,
    },
  };

  const recorded = await recordPlayVersion({
    supabase,
    playId,
    document: sanitizedDoc,
    parentVersionId: (play.current_version_id as string | null) ?? null,
    userId: user.id,
    kind: "edit",
    note: note ?? null,
    label: label ?? null,
  });
  if (!recorded.ok) return { ok: false as const, error: recorded.error };
  const ver = { id: recorded.versionId };

  const { error: updErr } = await supabase
    .from("plays")
    .update({
      current_version_id: ver.id,
      name: document.metadata.coachName,
      shorthand: document.metadata.shorthand,
      wristband_code: document.metadata.wristbandCode,
      formation_name: document.metadata.formation,
      concept: "",
      tags: document.metadata.tags,
      tag: document.metadata.tags[0] ?? "",
      display_abbrev: document.metadata.sheetAbbrev,
      formation_id: formationId,
      formation_tag: formationId ? document.metadata.formationTag ?? null : null,
      // Preserve existing DB play_type / special_teams_unit when the
      // document doesn't carry them. Falling back to "offense" here meant
      // a stale document (e.g. one inherited from a duplicate where the
      // metadata drifted from the row) could silently flip a defense play
      // to offense on the next save.
      play_type:
        document.metadata.playType ?? ((play.play_type as PlayType | null) ?? "offense"),
      special_teams_unit:
        document.metadata.specialTeamsUnit ??
        ((play.special_teams_unit as SpecialTeamsUnit | null) ?? null),
      opponent_formation_id: opponentFormationId,
      vs_play_id: vsPlayId,
      vs_play_snapshot: (document.metadata.vsPlaySnapshot ?? null) as unknown as Record<string, unknown> | null,
    })
    .eq("id", playId);

  if (updErr) {
    console.error("[savePlayVersionAction] plays update failed", { playId, error: updErr });
    return { ok: false as const, error: `Saved version but could not update play: ${updErr.message}` };
  }

  return { ok: true as const, versionId: ver.id };
}

/* ---------- Defense "install vs offense" ---------- */

/**
 * Snapshots an offensive play and creates a new defensive play cloned from
 * a base defense scheme, linked to that offense. The snapshot is frozen at
 * install time; callers must use `resyncDefenseVsPlayAction` to pick up
 * later edits to the offense.
 */
export async function installDefenseVsPlayAction(
  defensePlayId: string,
  offensivePlayId: string,
) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const [defenseLoaded, offenseLoaded] = await Promise.all([
    getPlayForEditorAction(defensePlayId),
    getPlayForEditorAction(offensivePlayId),
  ]);
  if (!defenseLoaded.ok) return { ok: false as const, error: defenseLoaded.error };
  if (!offenseLoaded.ok) return { ok: false as const, error: offenseLoaded.error };

  if ((defenseLoaded.document.metadata.playType ?? "offense") !== "defense") {
    return { ok: false as const, error: "Base play must be a defensive play." };
  }

  const { data: defenseRow, error: defErr } = await supabase
    .from("plays")
    .select("playbook_id, group_id, special_teams_unit")
    .eq("id", defensePlayId)
    .single();
  if (defErr || !defenseRow) return { ok: false as const, error: defErr?.message ?? "Defense row missing" };

  const snapshot: VsPlaySnapshot = {
    players: offenseLoaded.document.layers.players,
    routes: offenseLoaded.document.layers.routes,
    lineOfScrimmageY:
      typeof offenseLoaded.document.lineOfScrimmageY === "number"
        ? offenseLoaded.document.lineOfScrimmageY
        : 0.4,
    sourceVersionId: offenseLoaded.version.id as string,
    snapshotAt: new Date().toISOString(),
    sourceName: offenseLoaded.document.metadata.coachName || "Untitled",
    sourceFormationName: offenseLoaded.document.metadata.formation ?? "",
  };

  const doc = structuredClone(defenseLoaded.document) as PlayDocument;
  const baseName = doc.metadata.coachName || "Defense";
  doc.metadata.coachName = `${baseName} vs ${snapshot.sourceName}`;
  doc.metadata.vsPlayId = offensivePlayId;
  doc.metadata.vsPlaySnapshot = snapshot;

  // Wristband code: auto-assign a new one for this playbook.
  const { data: codeRows } = await supabase
    .from("plays")
    .select("wristband_code")
    .eq("playbook_id", defenseRow.playbook_id);
  const maxCode = (codeRows ?? [])
    .map((r) => parseInt((r.wristband_code as string | null) ?? "", 10))
    .filter((n): n is number => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0);
  doc.metadata.wristbandCode = String(maxCode + 1).padStart(2, "0");

  const { data: sortRow } = await supabase
    .from("plays")
    .select("sort_order")
    .eq("playbook_id", defenseRow.playbook_id)
    .eq("is_archived", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (sortRow?.sort_order ?? -1) + 1;

  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: defenseRow.playbook_id,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      concept: "",
      tags: doc.metadata.tags,
      tag: doc.metadata.tags[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      group_id: defenseRow.group_id,
      sort_order: nextSort,
      formation_id: doc.metadata.formationId ?? null,
      formation_tag: null,
      play_type: "defense",
      special_teams_unit: (defenseRow.special_teams_unit as SpecialTeamsUnit | null) ?? null,
      vs_play_id: offensivePlayId,
      vs_play_snapshot: snapshot as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 2,
      document: doc as unknown as Record<string, unknown>,
      label: "installed vs offense",
      created_by: user.id,
      kind: "create",
    })
    .select("id")
    .single();
  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", play.id);

  return { ok: true as const, playId: play.id };
}

/**
 * Rewrites the vs_play_snapshot for a defense play by pulling the current
 * offensive play's players/routes again. Fails if the play isn't linked.
 */
export async function resyncDefenseVsPlayAction(defensePlayId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const loaded = await getPlayForEditorAction(defensePlayId);
  if (!loaded.ok) return { ok: false as const, error: loaded.error };

  const vsId = loaded.document.metadata.vsPlayId;
  if (!vsId) return { ok: false as const, error: "This play isn't linked to an offense." };

  const offense = await getPlayForEditorAction(vsId);
  if (!offense.ok) return { ok: false as const, error: offense.error };

  const snapshot: VsPlaySnapshot = {
    players: offense.document.layers.players,
    routes: offense.document.layers.routes,
    lineOfScrimmageY:
      typeof offense.document.lineOfScrimmageY === "number"
        ? offense.document.lineOfScrimmageY
        : 0.4,
    sourceVersionId: offense.version.id as string,
    snapshotAt: new Date().toISOString(),
    sourceName: offense.document.metadata.coachName || "Untitled",
    sourceFormationName: offense.document.metadata.formation ?? "",
  };

  const doc = structuredClone(loaded.document) as PlayDocument;
  doc.metadata.vsPlaySnapshot = snapshot;

  const res = await savePlayVersionAction(defensePlayId, doc, "resync vs offense");
  if (!res.ok) return res;
  return { ok: true as const, snapshot };
}

export async function unlinkDefenseVsPlayAction(defensePlayId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const loaded = await getPlayForEditorAction(defensePlayId);
  if (!loaded.ok) return { ok: false as const, error: loaded.error };
  const doc = structuredClone(loaded.document) as PlayDocument;
  doc.metadata.vsPlayId = null;
  doc.metadata.vsPlaySnapshot = null;
  return savePlayVersionAction(defensePlayId, doc, "unlink vs offense");
}

export async function duplicatePlayAction(
  playId: string,
  opts?: { clearNotes?: boolean },
) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const loaded = await getPlayForEditorAction(playId);
  if (!loaded.ok) {
    return { ok: false as const, error: loaded.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: srcPlay, error: srcPlayErr } = await supabase
    .from("plays")
    .select("playbook_id, group_id, play_type, special_teams_unit, opponent_formation_id")
    .eq("id", playId)
    .single();
  if (srcPlayErr || !srcPlay) return { ok: false as const, error: "Not found" };

  const cap = await assertPlayCap(supabase, srcPlay.playbook_id as string);
  if (!cap.ok) return { ok: false as const, error: cap.error };

  const doc = structuredClone(loaded.document);
  doc.metadata.coachName = `${doc.metadata.coachName} (copy)`;
  if (opts?.clearNotes) doc.metadata.notes = "";
  // Pin the copied document's type metadata to the source row's DB columns
  // so any drift on the source doesn't ride into the copy's document and
  // then flip the new row's play_type on its next save.
  doc.metadata.playType = (srcPlay.play_type as PlayType | null) ?? "offense";
  doc.metadata.specialTeamsUnit =
    (srcPlay.special_teams_unit as SpecialTeamsUnit | null) ?? null;

  const { data: sortDup } = await supabase
    .from("plays")
    .select("sort_order")
    .eq("playbook_id", srcPlay.playbook_id)
    .eq("is_archived", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dupSort = (sortDup?.sort_order ?? -1) + 1;

  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: srcPlay.playbook_id,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      concept: "",
      tags: doc.metadata.tags,
      tag: doc.metadata.tags[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      group_id: srcPlay.group_id,
      sort_order: dupSort,
      play_type: (srcPlay.play_type as PlayType | null) ?? "offense",
      special_teams_unit: (srcPlay.special_teams_unit as SpecialTeamsUnit | null) ?? null,
      opponent_formation_id: (srcPlay.opponent_formation_id as string | null) ?? null,
    })
    .select("id")
    .single();

  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 2,
      document: doc as unknown as Record<string, unknown>,
      label: "duplicated",
      parent_version_id: loaded.version.id,
      created_by: user.id,
      kind: "create",
    })
    .select("id")
    .single();

  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", play.id);

  return { ok: true as const, playId: play.id };
}

export type CopyPlayFormationMode = "link" | "copy" | "unlink" | "pick";

/**
 * Copy a play into another playbook (or the current one). Deep-clones the
 * play's current version — no shared references, no version history carried
 * over. Formation is handled per `formationMode`:
 *  - "link":   keep the source formation link as-is. Only valid when the
 *              destination is the same playbook (formations are playbook-
 *              scoped). This is the right default for same-playbook copies
 *              — the formation already exists there, so no need to clone.
 *  - "copy":   deep-clone the source formation into the destination's team
 *              (with " 2" suffix on name collision).
 *  - "unlink": strip the formation link; players/routes travel as-is.
 *  - "pick":   use the destination formation specified by
 *              `destinationFormationId`. Routes are remapped by source-player
 *              *label* → destination-player label. Source routes whose label
 *              has no match are dropped; destination players with no match
 *              have no route.
 *
 * Group assignment, sort order, opponent link, and roster assignments do not
 * travel. Play-name collision in the destination gets " (copy)" / " (copy 2)".
 */
export async function copyPlayAction(params: {
  playId: string;
  destinationPlaybookId: string;
  formationMode: CopyPlayFormationMode;
  destinationFormationId?: string;
}): Promise<
  | {
      ok: true;
      playId: string;
      playbookId: string;
      droppedRouteCount: number;
      formationRenamed: boolean;
      formationNewName: string | null;
    }
  | { ok: false; error: string }
> {
  const { playId, destinationPlaybookId, formationMode, destinationFormationId } = params;
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (formationMode === "pick" && !destinationFormationId) {
    return { ok: false as const, error: "Pick a destination formation." };
  }

  const loaded = await getPlayForEditorAction(playId);
  if (!loaded.ok) return { ok: false as const, error: loaded.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  // Destination gate + basics
  const { data: destPb, error: destPbErr } = await supabase
    .from("playbooks")
    .select("id, team_id, sport_variant")
    .eq("id", destinationPlaybookId)
    .single();
  if (destPbErr || !destPb) {
    return { ok: false as const, error: destPbErr?.message ?? "Destination playbook not found." };
  }
  const { data: destMembership } = await supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", destinationPlaybookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!destMembership || (destMembership.role !== "owner" && destMembership.role !== "editor")) {
    return { ok: false as const, error: "You don't have permission to add plays to that playbook." };
  }

  const cap = await assertPlayCap(supabase, destinationPlaybookId);
  if (!cap.ok) return { ok: false as const, error: cap.error };

  // Source play row (for play_type + special_teams_unit)
  const { data: srcPlay, error: srcPlayErr } = await supabase
    .from("plays")
    .select("play_type, special_teams_unit")
    .eq("id", playId)
    .single();
  if (srcPlayErr || !srcPlay) return { ok: false as const, error: "Not found" };

  const doc = structuredClone(loaded.document) as PlayDocument;

  // --- Play name: " (copy)" with numeric suffix on destination collision ---
  const baseName = (doc.metadata.coachName || "Untitled play").trim();
  const { data: destPlayNames } = await supabase
    .from("plays")
    .select("name")
    .eq("playbook_id", destinationPlaybookId)
    .eq("is_archived", false);
  const takenNames = new Set(
    ((destPlayNames ?? []) as Array<{ name: string | null }>)
      .map((r) => (r.name ?? "").trim())
      .filter(Boolean),
  );
  let newName = `${baseName} (copy)`;
  if (takenNames.has(newName)) {
    let i = 2;
    while (takenNames.has(`${baseName} (copy ${i})`)) i += 1;
    newName = `${baseName} (copy ${i})`;
  }
  doc.metadata.coachName = newName;

  // --- Formation handling ---
  let droppedRouteCount = 0;
  let formationRenamed = false;
  let formationNewName: string | null = null;

  if (formationMode === "link") {
    // No-op: keep the source formation link intact. Only makes sense when
    // the destination is the same playbook, since formations are playbook-
    // scoped. Guard against misuse cross-playbook.
    if (doc.metadata.formationId) {
      const { data: linkedFormation } = await supabase
        .from("formations")
        .select("playbook_id")
        .eq("id", doc.metadata.formationId)
        .maybeSingle();
      if (
        linkedFormation &&
        linkedFormation.playbook_id &&
        linkedFormation.playbook_id !== destinationPlaybookId
      ) {
        return {
          ok: false as const,
          error:
            "Can't link to a formation from a different playbook. Copy or pick a destination formation instead.",
        };
      }
    }
  } else if (formationMode === "unlink") {
    doc.metadata.formationId = null;
    doc.metadata.formation = "";
    doc.metadata.formationTag = "";
  } else if (formationMode === "copy") {
    const srcFormationId = doc.metadata.formationId;
    if (srcFormationId) {
      // Inlined copy to keep the RPC single-statement: re-use the helper.
      const { copyFormationAction } = await import("@/app/actions/formations");
      const res = await copyFormationAction({
        formationId: srcFormationId,
        destinationPlaybookId,
      });
      if (!res.ok) return { ok: false as const, error: res.error };
      doc.metadata.formationId = res.formationId;
      doc.metadata.formation = res.newName;
      formationRenamed = res.renamed;
      formationNewName = res.newName;
    } // else: no formation linked — nothing to copy.
  } else if (formationMode === "pick" && destinationFormationId) {
    const { data: destFormation, error: destFormErr } = await supabase
      .from("formations")
      .select("params")
      .eq("id", destinationFormationId)
      .single();
    if (destFormErr || !destFormation) {
      return { ok: false as const, error: "Destination formation not found." };
    }
    const destParams = destFormation.params as {
      displayName: string;
      players: Player[];
    };

    // Label-based remap: source player id -> label -> destination player id.
    const srcPlayers = doc.layers.players;
    const srcIdToLabel = new Map<string, string>(
      srcPlayers.map((p) => [p.id, p.label.trim()]),
    );
    const destLabelToId = new Map<string, string>();
    for (const dp of destParams.players) {
      const lbl = dp.label.trim();
      if (lbl && !destLabelToId.has(lbl)) destLabelToId.set(lbl, dp.id);
    }

    const remappedRoutes: Route[] = [];
    for (const route of doc.layers.routes) {
      const lbl = srcIdToLabel.get(route.carrierPlayerId);
      const newCarrierId = lbl ? destLabelToId.get(lbl) : undefined;
      if (newCarrierId) {
        remappedRoutes.push({ ...structuredClone(route), carrierPlayerId: newCarrierId });
      } else {
        droppedRouteCount += 1;
      }
    }

    doc.layers.players = structuredClone(destParams.players);
    doc.layers.routes = remappedRoutes;
    doc.metadata.formationId = destinationFormationId;
    doc.metadata.formation = destParams.displayName ?? "";
    doc.metadata.formationTag = "";
  }

  // Opponent link + grouping do not travel cross-playbook.
  doc.metadata.opponentFormationId = null;
  doc.metadata.vsPlayId = null;
  doc.metadata.vsPlaySnapshot = null;

  // --- Sort order: append to end of destination ---
  const { data: sortDup } = await supabase
    .from("plays")
    .select("sort_order")
    .eq("playbook_id", destinationPlaybookId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dupSort = (sortDup?.sort_order ?? -1) + 1;

  // --- Insert play row + first version ---
  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: destinationPlaybookId,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      formation_id: doc.metadata.formationId ?? null,
      formation_tag: doc.metadata.formationTag ?? null,
      concept: "",
      tags: doc.metadata.tags,
      tag: doc.metadata.tags[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      group_id: null,
      sort_order: dupSort,
      play_type: (srcPlay.play_type as PlayType | null) ?? "offense",
      special_teams_unit: (srcPlay.special_teams_unit as SpecialTeamsUnit | null) ?? null,
      opponent_formation_id: null,
    })
    .select("id")
    .single();
  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 2,
      document: doc as unknown as Record<string, unknown>,
      label: "copied",
      parent_version_id: null,
      created_by: user.id,
      kind: "create",
    })
    .select("id")
    .single();
  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", play.id);

  return {
    ok: true as const,
    playId: play.id,
    playbookId: destinationPlaybookId,
    droppedRouteCount,
    formationRenamed,
    formationNewName,
  };
}

export async function renamePlayAction(playId: string, name: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: pb } = await supabase
    .from("plays")
    .select("playbook_id")
    .eq("id", playId)
    .maybeSingle();
  if (pb?.playbook_id) {
    const gameLock = await assertNoActiveGameSession(
      supabase,
      pb.playbook_id as string,
    );
    if (gameLock.locked) return gameModeLockedResult(gameLock.lock);
  }

  const { error } = await supabase.from("plays").update({ name: trimmed }).eq("id", playId);
  if (error) return { ok: false as const, error: error.message };

  // Keep the canonical PlayDocument in sync with the denormalized `plays.name`
  // so renders that read from `play_versions.document.metadata.coachName`
  // (print preview, PDF export) don't show the old name.
  const { data: playRow } = await supabase
    .from("plays")
    .select("current_version_id")
    .eq("id", playId)
    .maybeSingle();
  const currentVersionId = playRow?.current_version_id as string | null | undefined;
  if (currentVersionId) {
    const { data: versionRow } = await supabase
      .from("play_versions")
      .select("document")
      .eq("id", currentVersionId)
      .maybeSingle();
    const doc = versionRow?.document as PlayDocument | undefined;
    if (doc) {
      const nextDoc: PlayDocument = {
        ...doc,
        metadata: { ...doc.metadata, coachName: trimmed },
      };
      await supabase
        .from("play_versions")
        .update({ document: nextDoc })
        .eq("id", currentVersionId);
    }
  }

  const { data: row } = await supabase
    .from("plays")
    .select("playbook_id")
    .eq("id", playId)
    .maybeSingle();
  if (row?.playbook_id) {
    revalidatePath(`/playbooks/${row.playbook_id}`);
  }

  return { ok: true as const };
}

export async function archivePlayAction(playId: string, archived: boolean) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: pb } = await supabase
    .from("plays")
    .select("playbook_id")
    .eq("id", playId)
    .maybeSingle();
  if (pb?.playbook_id) {
    const gameLock = await assertNoActiveGameSession(
      supabase,
      pb.playbook_id as string,
    );
    if (gameLock.locked) return gameModeLockedResult(gameLock.lock);
  }

  const { error } = await supabase
    .from("plays")
    .update({ is_archived: archived })
    .eq("id", playId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deletePlayAction(playId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: pb } = await supabase
    .from("plays")
    .select("playbook_id")
    .eq("id", playId)
    .maybeSingle();
  if (pb?.playbook_id) {
    const gameLock = await assertNoActiveGameSession(
      supabase,
      pb.playbook_id as string,
    );
    if (gameLock.locked) return gameModeLockedResult(gameLock.lock);
  }

  // Soft-delete: row stays for 30 days in trash, then a nightly job hard-deletes.
  // Restore is just clearing deleted_at, which the trash UI handles.
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("plays")
    .update({ deleted_at: now })
    .eq("id", playId);
  if (error) return { ok: false as const, error: error.message };
  // Cascade to hidden custom-opponent children attached to this play.
  await supabase
    .from("plays")
    .update({ deleted_at: now })
    .eq("attached_to_play_id", playId)
    .is("deleted_at", null);
  return { ok: true as const };
}

/**
 * Create a play in the user's Inbox playbook and return its id.
 * Used by the "just start editing" flow for new users and the dashboard's
 * quick-create button.
 */
export async function quickCreatePlayAction(initialPlayers?: Player[]) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { teamId } = await ensureDefaultWorkspace(supabase, user.id);
  const inboxId = await getOrCreateInboxPlaybook(supabase, teamId);
  return createPlayAction(inboxId, initialPlayers ? { initialPlayers } : undefined);
}

export type DashboardPlaybookTile = {
  id: string;
  name: string;
  is_default: boolean;
  updated_at: string | null;
  play_count: number;
  logo_url: string | null;
  color: string | null;
  season: string | null;
  role: "owner" | "editor" | "viewer";
  /** Display name of the playbook owner when the current viewer is not the
   *  owner (shared playbook). Null for your own playbooks. */
  shared_by_name: string | null;
  allow_coach_duplication: boolean;
  allow_player_duplication: boolean;
  /** True when the owner is on Free tier and this playbook is beyond the
   *  free cap (keeps content visible but read-only). Shared playbooks from
   *  Coach+ owners are never locked. */
  is_locked: boolean;
  is_archived: boolean;
  sport_variant: SportVariant;
  settings: PlaybookSettings;
  /** Admin-marked example flag — drives the "Public example" banner and
   *  unlocks the Publish action in the tile menu. */
  is_example: boolean;
  /** Marked example AND published — visible on /examples when the global
   *  flag is on. */
  is_public_example: boolean;
  /** The single playbook (max one across the whole DB) that takes over the
   *  home-page hero shot. Site admin selects via the playbook tile menu. */
  is_hero_marketing_example: boolean;
  previews: {
    players: Player[];
    routes: Route[];
    zones: Zone[];
    lineOfScrimmageY: number;
  }[];
};

const PREVIEWS_PER_BOOK = 12;
const PREVIEW_CACHE_SECONDS = 20 * 60;

type PreviewPayload = {
  players: Player[];
  routes: Route[];
  zones: Zone[];
  lineOfScrimmageY: number;
};

/**
 * Load up to 12 recent offensive play previews for a single playbook, using
 * the service-role client and Next.js `unstable_cache` (20 min TTL). The
 * caller must have already verified the user's access to this playbook.
 */
const getCachedPlaybookPreviews = unstable_cache(
  async (bookId: string): Promise<PreviewPayload[]> => {
    const svc = createServiceRoleClient();
    const { data: playRows } = await svc
      .from("plays")
      .select("current_version_id, updated_at")
      .eq("playbook_id", bookId)
      .eq("is_archived", false)
      .is("attached_to_play_id", null)
      .eq("play_type", "offense")
      .order("updated_at", { ascending: false })
      .limit(PREVIEWS_PER_BOOK);

    const versionIds = (playRows ?? [])
      .map((r) => r.current_version_id as string | null)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (versionIds.length === 0) return [];

    const { data: versions } = await svc
      .from("play_versions")
      .select("id, document")
      .in("id", versionIds);

    const byVid = new Map<string, PreviewPayload>();
    for (const v of versions ?? []) {
      const doc = v.document as PlayDocument | null;
      if (!doc) continue;
      byVid.set(v.id as string, {
        players: doc.layers?.players ?? [],
        routes: doc.layers?.routes ?? [],
        zones: doc.layers?.zones ?? [],
        lineOfScrimmageY:
          typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
      });
    }
    return versionIds
      .map((vid) => byVid.get(vid))
      .filter((p): p is PreviewPayload => p != null);
  },
  ["dashboard-playbook-previews"],
  { revalidate: PREVIEW_CACHE_SECONDS },
);

export type DashboardSummary = {
  playbooks: DashboardPlaybookTile[];
  totalPlays: number;
  senderName: string | null;
};

/** One-shot dashboard fetch. Non-archived plays and non-archived playbooks only. */
export async function getDashboardSummaryAction(): Promise<
  { ok: true; data: DashboardSummary } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  await ensureDefaultWorkspace(supabase, user.id);

  // Read through playbook_members so we get both owned and shared playbooks,
  // and know the caller's role on each.
  const { data: memberRows, error: memErr } = await supabase
    .from("playbook_members")
    .select(
      "role, playbooks!inner(id, name, is_default, is_archived, updated_at, logo_url, color, season, sport_variant, settings, custom_offense_count, allow_coach_duplication, allow_player_duplication, is_example, is_public_example, is_hero_marketing_example, plays(count))",
    )
    .eq("user_id", user.id)
    .eq("playbooks.plays.is_archived", false)
    .is("playbooks.plays.deleted_at", null);

  if (memErr) return { ok: false, error: memErr.message };

  type PlaybookJoin = {
    id: string;
    name: string;
    is_default: boolean;
    is_archived: boolean | null;
    updated_at: string | null;
    logo_url: string | null;
    color: string | null;
    season: string | null;
    sport_variant: string | null;
    settings: unknown;
    custom_offense_count: number | null;
    allow_coach_duplication: boolean | null;
    allow_player_duplication: boolean | null;
    is_example: boolean | null;
    is_public_example: boolean | null;
    is_hero_marketing_example: boolean | null;
    plays: { count: number }[] | { count: number } | null;
  };
  type MemberJoin = {
    role: "owner" | "editor" | "viewer";
    playbooks: PlaybookJoin | PlaybookJoin[] | null;
  };

  const playbooks: DashboardPlaybookTile[] = ((memberRows ?? []) as unknown as MemberJoin[])
    .map((r) => {
      const b = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
      if (!b) return null;
      const agg = Array.isArray(b.plays) ? b.plays[0] : b.plays;
      const variant = (b.sport_variant as SportVariant) ?? "flag_7v7";
      return {
        id: b.id,
        name: b.name,
        is_default: b.is_default,
        updated_at: b.updated_at,
        play_count: agg?.count ?? 0,
        logo_url: b.logo_url,
        color: b.color,
        season: b.season,
        role: r.role,
        shared_by_name: null,
        allow_coach_duplication: b.allow_coach_duplication ?? true,
        allow_player_duplication: b.allow_player_duplication ?? true,
        is_locked: false,
        is_archived: Boolean(b.is_archived),
        sport_variant: variant,
        settings: normalizePlaybookSettings(b.settings, variant, b.custom_offense_count ?? null),
        is_example: Boolean(b.is_example),
        is_public_example: Boolean(b.is_public_example),
        is_hero_marketing_example: Boolean(b.is_hero_marketing_example),
        previews: [],
      } as DashboardPlaybookTile;
    })
    .filter((r): r is DashboardPlaybookTile => r !== null)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

  // For shared playbooks, resolve the owner's display name so tiles can
  // show a "Shared by …" corner badge. Use the service-role client so we
  // can read other users' playbook_members rows (RLS hides them from the
  // caller).
  const sharedIds = playbooks.filter((b) => b.role !== "owner").map((b) => b.id);
  if (sharedIds.length > 0) {
    const svc = createServiceRoleClient();
    const { data: ownerRows } = await svc
      .from("playbook_members")
      .select("playbook_id, user_id")
      .in("playbook_id", sharedIds)
      .eq("role", "owner")
      .eq("status", "active");
    const ownerIds = Array.from(
      new Set((ownerRows ?? []).map((r) => r.user_id as string)),
    );
    const nameByUser = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: profileRows } = await svc
        .from("profiles")
        .select("id, display_name")
        .in("id", ownerIds);
      for (const p of profileRows ?? []) {
        const name = (p.display_name as string | null) ?? "";
        if (name.trim()) nameByUser.set(p.id as string, name);
      }
    }
    const ownerByBook = new Map<string, string>();
    for (const r of ownerRows ?? []) {
      const name = nameByUser.get(r.user_id as string);
      if (name) ownerByBook.set(r.playbook_id as string, name);
    }
    for (const book of playbooks) {
      if (book.role !== "owner") {
        book.shared_by_name = ownerByBook.get(book.id) ?? null;
      }
    }
  }

  // Apply downgrade locks: free owners see their extra playbooks as locked.
  const locks = await computeDowngradeLocks(user.id);
  if (locks.lockedPlaybookIds.size > 0) {
    for (const book of playbooks) {
      if (book.role === "owner" && locks.lockedPlaybookIds.has(book.id)) {
        book.is_locked = true;
      }
    }
  }

  // Load up to 12 recent offensive play previews per playbook. This is
  // cached per-book for ~20 minutes — cover/book tile art doesn't need to be
  // instantaneous after a play edit, and regenerating the preview payload on
  // every dashboard load gets expensive on large books.
  await Promise.all(
    playbooks.map(async (book) => {
      book.previews = await getCachedPlaybookPreviews(book.id);
    }),
  );

  const totalPlays = playbooks.reduce((n, b) => n + b.play_count, 0);

  const { data: selfProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const senderName =
    (selfProfile?.display_name as string | null) || user.email || null;

  return {
    ok: true,
    data: {
      playbooks,
      totalPlays,
      senderName,
    },
  };
}

export async function listPlaybookPlaysForNavigationAction(playbookId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", plays: [], groups: [] };
  }
  const supabase = await createClient();
  // No auth gate — RLS covers access to private vs public-example data.

  const [{ data: groups, error: gErr }, { data: rows, error: pErr }] = await Promise.all([
    supabase
      .from("playbook_groups")
      .select("id, name, sort_order")
      .eq("playbook_id", playbookId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("plays")
      .select(
        "id, name, wristband_code, shorthand, formation_name, concept, tags, tag, group_id, sort_order, current_version_id, play_type",
      )
      .eq("playbook_id", playbookId)
      .is("deleted_at", null)
      .is("attached_to_play_id", null)
      .eq("is_archived", false),
  ]);

  if (gErr) return { ok: false as const, error: gErr.message, plays: [], groups: [] };
  if (pErr) return { ok: false as const, error: pErr.message, plays: [], groups: [] };

  const versionIds = (rows ?? [])
    .map((r) => r.current_version_id as string | null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const previewByVersion = new Map<
    string,
    { players: Player[]; routes: Route[]; zones: Zone[]; lineOfScrimmageY: number }
  >();
  if (versionIds.length > 0) {
    // Same jsonb-path slim select as listPlaysAction — see comment
    // there for rationale.
    const { data: versions } = await supabase
      .from("play_versions")
      .select(
        "id, players:document->layers->players, routes:document->layers->routes, zones:document->layers->zones, los:document->lineOfScrimmageY",
      )
      .in("id", versionIds);
    for (const v of (versions ?? []) as Array<{
      id: string;
      players: Player[] | null;
      routes: Route[] | null;
      zones: Zone[] | null;
      los: number | null;
    }>) {
      previewByVersion.set(v.id, {
        players: v.players ?? [],
        routes: v.routes ?? [],
        zones: v.zones ?? [],
        lineOfScrimmageY: typeof v.los === "number" ? v.los : 0.4,
      });
    }
  }

  const gMap = new Map((groups ?? []).map((g) => [g.id as string, g as PlaybookGroupRow]));
  const items: PlaybookPlayNavItem[] = (rows ?? []).map((row) => {
    const gid = (row.group_id as string | null) ?? null;
    const g = gid ? gMap.get(gid) : undefined;
    const tagsArr = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    const legacyTag = (row.tag as string | null) ?? "";
    const vid = (row.current_version_id as string | null) ?? null;
    return {
      id: row.id as string,
      name: row.name as string,
      wristband_code: (row.wristband_code as string) ?? "",
      shorthand: (row.shorthand as string) ?? "",
      formation_name: (row.formation_name as string) ?? "",
      concept: (row.concept as string) ?? "",
      tags: tagsArr.length > 0 ? tagsArr : legacyTag ? [legacyTag] : [],
      group_id: gid,
      sort_order: (row.sort_order as number) ?? 0,
      group_name: g?.name ?? null,
      group_sort_order: g?.sort_order ?? null,
      current_version_id: vid,
      play_type: ((row.play_type as "offense" | "defense" | "special_teams" | null) ?? "offense"),
      preview: vid ? previewByVersion.get(vid) ?? null : null,
    };
  });
  items.sort(compareNavPlays);

  return {
    ok: true as const,
    plays: items,
    groups: (groups ?? []) as PlaybookGroupRow[],
  };
}

export type PlaybookPrintPackRow = {
  id: string;
  nav: PlaybookPlayNavItem;
  document: PlayDocument;
};

export async function loadPlaybookPrintPackAction(playbookId: string) {
  const listed = await listPlaybookPlaysForNavigationAction(playbookId);
  if (!listed.ok) {
    return {
      ok: false as const,
      error: listed.error,
      pack: [] as PlaybookPrintPackRow[],
      groups: [] as PlaybookGroupRow[],
    };
  }

  const versionIds = listed.plays
    .map((p) => p.current_version_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (versionIds.length === 0) {
    return { ok: true as const, pack: [] as PlaybookPrintPackRow[], groups: listed.groups };
  }

  // No auth gate — anonymous visitors can print-preview a published
  // example playbook. RLS (0065_public_example_read.sql) controls
  // which play_versions are visible: members see their own, anyone
  // sees public examples, everyone else gets nothing back.
  const supabase = await createClient();

  const { data: versions, error: vErr } = await supabase
    .from("play_versions")
    .select("id, document")
    .in("id", versionIds);
  if (vErr) {
    return { ok: false as const, error: vErr.message, pack: [], groups: listed.groups };
  }

  const byVer = new Map(
    (versions ?? []).map((v) => [v.id as string, v.document as PlayDocument]),
  );

  const pack: PlaybookPrintPackRow[] = [];
  for (const nav of listed.plays) {
    const vid = nav.current_version_id;
    if (!vid) continue;
    const document = byVer.get(vid);
    if (!document) continue;
    pack.push({ id: nav.id, nav, document });
  }

  return { ok: true as const, pack, groups: listed.groups };
}

export async function createPlaybookGroupAction(playbookId: string, name: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const label = name.trim() || "Group";
  const { data: maxRow } = await supabase
    .from("playbook_groups")
    .select("sort_order")
    .eq("playbook_id", playbookId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: row, error } = await supabase
    .from("playbook_groups")
    .insert({ playbook_id: playbookId, name: label, sort_order: nextOrder })
    .select("id, name, sort_order")
    .single();
  if (error || !row) return { ok: false as const, error: error?.message ?? "Insert failed" };
  await recordPlaybookVersion({
    supabase,
    playbookId,
    userId: user.id,
    kind: "edit",
    diffSummary: `Added group "${label}"`,
  });
  return { ok: true as const, group: row as PlaybookGroupRow };
}

export async function renamePlaybookGroupAction(groupId: string, name: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const label = name.trim();
  if (!label) return { ok: false as const, error: "Name cannot be empty." };

  const { data: existing } = await supabase
    .from("playbook_groups")
    .select("playbook_id, name")
    .eq("id", groupId)
    .maybeSingle();
  const { error } = await supabase
    .from("playbook_groups")
    .update({ name: label })
    .eq("id", groupId);
  if (error) return { ok: false as const, error: error.message };
  if (existing?.playbook_id) {
    await recordPlaybookVersion({
      supabase,
      playbookId: existing.playbook_id as string,
      userId: user.id,
      kind: "edit",
      diffSummary: `Renamed group "${existing.name ?? ""}" → "${label}"`,
    });
  }
  return { ok: true as const };
}

export async function deletePlaybookGroupAction(groupId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: existing } = await supabase
    .from("playbook_groups")
    .select("playbook_id, name")
    .eq("id", groupId)
    .maybeSingle();
  // Plays inside a deleted folder stay live and unparent to the "Recovered"
  // bucket. Soft-delete the folder so it's restorable from trash for 30 days.
  const { error: unassignErr } = await supabase
    .from("plays")
    .update({ group_id: null })
    .eq("group_id", groupId);
  if (unassignErr) return { ok: false as const, error: unassignErr.message };

  const { error } = await supabase
    .from("playbook_groups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", groupId);
  if (error) return { ok: false as const, error: error.message };
  if (existing?.playbook_id) {
    await recordPlaybookVersion({
      supabase,
      playbookId: existing.playbook_id as string,
      userId: user.id,
      kind: "edit",
      diffSummary: `Deleted group "${existing.name ?? ""}" (plays moved to ungrouped)`,
    });
  }
  return { ok: true as const };
}

export async function reorderPlaybookGroupsAction(
  playbookId: string,
  orderedGroupIds: string[],
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  for (let i = 0; i < orderedGroupIds.length; i++) {
    const { error } = await supabase
      .from("playbook_groups")
      .update({ sort_order: i })
      .eq("id", orderedGroupIds[i])
      .eq("playbook_id", playbookId);
    if (error) return { ok: false as const, error: error.message };
  }
  await recordPlaybookVersion({
    supabase,
    playbookId,
    userId: user.id,
    kind: "edit",
    diffSummary: "Reordered groups",
  });
  return { ok: true as const };
}

export async function reorderPlaysAction(
  playbookId: string,
  orderedPlayIds: string[],
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  for (let i = 0; i < orderedPlayIds.length; i++) {
    const { error } = await supabase
      .from("plays")
      .update({ sort_order: i })
      .eq("id", orderedPlayIds[i])
      .eq("playbook_id", playbookId);
    if (error) return { ok: false as const, error: error.message };
  }
  await recordPlaybookVersion({
    supabase,
    playbookId,
    userId: user.id,
    kind: "edit",
    diffSummary: "Reordered plays",
  });
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const };
}

export async function swapPlaySortOrderAction(
  playbookId: string,
  aId: string,
  bId: string,
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: rows, error: readErr } = await supabase
    .from("plays")
    .select("id, sort_order")
    .eq("playbook_id", playbookId)
    .in("id", [aId, bId]);
  if (readErr) return { ok: false as const, error: readErr.message };
  const a = rows?.find((r) => r.id === aId);
  const b = rows?.find((r) => r.id === bId);
  if (!a || !b) return { ok: false as const, error: "Plays not found." };
  const aOrder = (a.sort_order as number | null) ?? 0;
  const bOrder = (b.sort_order as number | null) ?? 0;
  const { error: e1 } = await supabase
    .from("plays")
    .update({ sort_order: bOrder })
    .eq("id", aId)
    .eq("playbook_id", playbookId);
  if (e1) return { ok: false as const, error: e1.message };
  const { error: e2 } = await supabase
    .from("plays")
    .update({ sort_order: aOrder })
    .eq("id", bId)
    .eq("playbook_id", playbookId);
  if (e2) return { ok: false as const, error: e2.message };
  await recordPlaybookVersion({
    supabase,
    playbookId,
    userId: user.id,
    kind: "edit",
    diffSummary: "Swapped play order",
  });
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const };
}

export async function setPlayGroupAction(playId: string, groupId: string | null) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: existing } = await supabase
    .from("plays")
    .select("playbook_id")
    .eq("id", playId)
    .maybeSingle();
  const { error } = await supabase.from("plays").update({ group_id: groupId }).eq("id", playId);
  if (error) return { ok: false as const, error: error.message };
  if (existing?.playbook_id) {
    await recordPlaybookVersion({
      supabase,
      playbookId: existing.playbook_id as string,
      userId: user.id,
      kind: "edit",
      diffSummary: "Moved play to a different group",
    });
  }
  return { ok: true as const };
}

/** Ensure workspace for actions that need team context */
/* ---------- Custom opponent (hidden play attached to a parent) ---------- */

/**
 * Build a default opposing-side document for the parent play. Offense parents
 * get a default defense; defense parents get a default offense. The resulting
 * play is "hidden" (attached_to_play_id set) — never listed in pickers/RAG —
 * and exists only to back the parent's `vs_play_snapshot`.
 */
async function loadParentForCustomOpponent(parentPlayId: string) {
  const supabase = await createClient();
  const { data: parent, error } = await supabase
    .from("plays")
    .select(
      "id, playbook_id, group_id, play_type, vs_play_id, attached_to_play_id, playbooks!inner(sport_variant)",
    )
    .eq("id", parentPlayId)
    .single();
  if (error || !parent) return { ok: false as const, error: error?.message ?? "Parent not found" };
  if (parent.attached_to_play_id) {
    return { ok: false as const, error: "Cannot attach a custom opponent to a hidden play." };
  }
  const pb = Array.isArray(parent.playbooks) ? parent.playbooks[0] : parent.playbooks;
  const variant = (pb?.sport_variant as SportVariant | null) ?? "flag_7v7";
  return { ok: true as const, supabase, parent, variant };
}

export async function createCustomOpponentAction(parentPlayId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const ctx = await loadParentForCustomOpponent(parentPlayId);
  if (!ctx.ok) return ctx;
  const { supabase, parent, variant } = ctx;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const ownerId = await getPlaybookOwnerId(parent.playbook_id as string);
  if (ownerId) {
    const lock = await assertNotLocked({
      ownerId,
      playbookId: parent.playbook_id as string,
      playId: parent.id as string,
    });
    if (!lock.ok) return { ok: false as const, error: lock.error };
  }
  const gameLock = await assertNoActiveGameSession(supabase, parent.playbook_id as string);
  if (gameLock.locked) return gameModeLockedResult(gameLock.lock);

  // Replacing any prior custom opponent: soft-delete the existing hidden child.
  await supabase
    .from("plays")
    .update({ deleted_at: new Date().toISOString() })
    .eq("attached_to_play_id", parentPlayId)
    .is("deleted_at", null);

  const parentType = (parent.play_type as PlayType | null) ?? "offense";
  const sportProfile = sportProfileForVariant(variant);
  const players: Player[] =
    parentType === "offense"
      ? defaultDefendersForVariant(variant)
      : defaultPlayersForVariant(variant);

  const doc = createEmptyPlayDocument({
    sportProfile,
    layers: { players, routes: [], annotations: [] },
  });
  doc.metadata.coachName = "Custom opponent";
  doc.metadata.playType = parentType === "offense" ? "defense" : "offense";

  const { data: hidden, error: insErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: parent.playbook_id,
      name: doc.metadata.coachName,
      shorthand: "",
      wristband_code: "",
      formation_name: "",
      concept: "",
      tags: [],
      tag: "",
      group_id: null,
      sort_order: 0,
      formation_id: null,
      formation_tag: null,
      play_type: doc.metadata.playType,
      special_teams_unit: null,
      attached_to_play_id: parentPlayId,
    })
    .select("id")
    .single();
  if (insErr || !hidden) return { ok: false as const, error: insErr?.message ?? "Insert failed" };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: hidden.id,
      schema_version: 2,
      document: doc as unknown as Record<string, unknown>,
      label: "custom opponent created",
      created_by: user.id,
      kind: "create",
    })
    .select("id")
    .single();
  if (verErr || !ver) return { ok: false as const, error: verErr?.message ?? "Version insert failed" };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", hidden.id);

  // Update parent: link vs_play_id + snapshot, ensure visible.
  const snapshot: VsPlaySnapshot = {
    players: doc.layers.players,
    routes: doc.layers.routes,
    lineOfScrimmageY:
      typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
    sourceVersionId: ver.id as string,
    snapshotAt: new Date().toISOString(),
    sourceName: doc.metadata.coachName,
    sourceFormationName: "",
  };
  await supabase
    .from("plays")
    .update({
      vs_play_id: hidden.id,
      vs_play_snapshot: snapshot as unknown as Record<string, unknown>,
      opponent_hidden: false,
    })
    .eq("id", parentPlayId);

  return { ok: true as const, hiddenPlayId: hidden.id, players: doc.layers.players };
}

/**
 * In-place mutate the hidden custom opponent's document (no version row), and
 * refresh the parent's vs_play_snapshot. Skips versioning by design — these
 * hidden plays would otherwise spam `play_versions` on every drag.
 */
export async function updateCustomOpponentPlayersAction(
  parentPlayId: string,
  players: Player[],
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: parent } = await supabase
    .from("plays")
    .select("id, playbook_id, vs_play_id")
    .eq("id", parentPlayId)
    .single();
  if (!parent?.vs_play_id) return { ok: false as const, error: "No custom opponent attached." };

  const gameLock = await assertNoActiveGameSession(supabase, parent.playbook_id as string);
  if (gameLock.locked) return gameModeLockedResult(gameLock.lock);

  const { data: hidden } = await supabase
    .from("plays")
    .select("id, attached_to_play_id, current_version_id")
    .eq("id", parent.vs_play_id)
    .single();
  if (!hidden || hidden.attached_to_play_id !== parentPlayId) {
    return { ok: false as const, error: "Linked opponent is not a custom hidden play." };
  }
  if (!hidden.current_version_id) return { ok: false as const, error: "Hidden play has no version." };

  const { data: ver } = await supabase
    .from("play_versions")
    .select("id, document")
    .eq("id", hidden.current_version_id)
    .single();
  if (!ver) return { ok: false as const, error: "Version row missing." };

  const doc = normalizePlayDocument(ver.document as PlayDocument);
  const nextDoc: PlayDocument = {
    ...doc,
    layers: { ...doc.layers, players },
  };

  const { error: updVerErr } = await supabase
    .from("play_versions")
    .update({ document: nextDoc as unknown as Record<string, unknown> })
    .eq("id", ver.id);
  if (updVerErr) return { ok: false as const, error: updVerErr.message };

  const snapshot: VsPlaySnapshot = {
    players: nextDoc.layers.players,
    routes: nextDoc.layers.routes,
    lineOfScrimmageY:
      typeof nextDoc.lineOfScrimmageY === "number" ? nextDoc.lineOfScrimmageY : 0.4,
    sourceVersionId: ver.id as string,
    snapshotAt: new Date().toISOString(),
    sourceName: nextDoc.metadata.coachName ?? "Custom opponent",
    sourceFormationName: "",
  };
  await supabase
    .from("plays")
    .update({ vs_play_snapshot: snapshot as unknown as Record<string, unknown> })
    .eq("id", parentPlayId);

  return { ok: true as const, snapshot };
}

export async function setOpponentHiddenAction(parentPlayId: string, hidden: boolean) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: parent } = await supabase
    .from("plays")
    .select("id, playbook_id")
    .eq("id", parentPlayId)
    .single();
  if (!parent) return { ok: false as const, error: "Not found" };

  const gameLock = await assertNoActiveGameSession(supabase, parent.playbook_id as string);
  if (gameLock.locked) return gameModeLockedResult(gameLock.lock);

  const { error } = await supabase
    .from("plays")
    .update({ opponent_hidden: hidden })
    .eq("id", parentPlayId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/**
 * Promote the hidden custom opponent into a standalone play in the same
 * playbook. The original hidden play stays attached so the parent's snapshot
 * doesn't change; the user is taken to the new standalone copy to edit.
 */
export async function promoteCustomOpponentAction(
  parentPlayId: string,
  name: string,
  groupId?: string | null,
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: parent } = await supabase
    .from("plays")
    .select("id, playbook_id, vs_play_id")
    .eq("id", parentPlayId)
    .single();
  if (!parent?.vs_play_id) return { ok: false as const, error: "No custom opponent to promote." };

  const cap = await assertPlayCap(supabase, parent.playbook_id as string);
  if (!cap.ok) return { ok: false as const, error: cap.error };

  const gameLock = await assertNoActiveGameSession(supabase, parent.playbook_id as string);
  if (gameLock.locked) return gameModeLockedResult(gameLock.lock);

  const { data: hidden } = await supabase
    .from("plays")
    .select("id, attached_to_play_id, current_version_id, play_type")
    .eq("id", parent.vs_play_id)
    .single();
  if (!hidden || hidden.attached_to_play_id !== parentPlayId) {
    return { ok: false as const, error: "Linked opponent is not a custom hidden play." };
  }
  if (!hidden.current_version_id) return { ok: false as const, error: "Hidden play has no version." };

  const { data: ver } = await supabase
    .from("play_versions")
    .select("id, document")
    .eq("id", hidden.current_version_id)
    .single();
  if (!ver) return { ok: false as const, error: "Version row missing." };

  const doc = normalizePlayDocument(ver.document as PlayDocument);
  doc.metadata.coachName = trimmed;

  const { data: sortRow } = await supabase
    .from("plays")
    .select("sort_order")
    .eq("playbook_id", parent.playbook_id)
    .eq("is_archived", false)
    .is("attached_to_play_id", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (sortRow?.sort_order ?? -1) + 1;

  const { data: codeRows } = await supabase
    .from("plays")
    .select("wristband_code")
    .eq("playbook_id", parent.playbook_id);
  const maxCode = (codeRows ?? [])
    .map((r) => parseInt((r.wristband_code as string | null) ?? "", 10))
    .filter((n): n is number => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0);
  const wristband = String(maxCode + 1).padStart(2, "0");
  doc.metadata.wristbandCode = wristband;

  const { data: newPlay, error: insErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: parent.playbook_id,
      name: trimmed,
      shorthand: doc.metadata.shorthand ?? "",
      wristband_code: wristband,
      formation_name: doc.metadata.formation ?? "",
      concept: "",
      tags: doc.metadata.tags ?? [],
      tag: (doc.metadata.tags ?? [])[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      group_id: groupId ?? null,
      sort_order: nextSort,
      formation_id: doc.metadata.formationId ?? null,
      formation_tag: null,
      play_type: (hidden.play_type as PlayType | null) ?? doc.metadata.playType ?? "defense",
      special_teams_unit: null,
    })
    .select("id")
    .single();
  if (insErr || !newPlay) return { ok: false as const, error: insErr?.message ?? "Insert failed" };

  const { data: newVer, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: newPlay.id,
      schema_version: 2,
      document: doc as unknown as Record<string, unknown>,
      label: "promoted from custom opponent",
      created_by: user.id,
      kind: "create",
    })
    .select("id")
    .single();
  if (verErr || !newVer) return { ok: false as const, error: verErr?.message ?? "Version insert failed" };

  await supabase.from("plays").update({ current_version_id: newVer.id }).eq("id", newPlay.id);

  return { ok: true as const, playId: newPlay.id };
}

export async function ensureUserWorkspaceAction() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const ws = await ensureDefaultWorkspace(supabase, user.id);
  return { ok: true as const, ...ws };
}
