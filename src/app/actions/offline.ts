"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import type { PlayDocument } from "@/domain/play/types";

export type OfflinePlaybookBundle = {
  meta: {
    id: string;
    name: string;
    season: string | null;
    sportVariant: string;
    color: string;
    logoUrl: string | null;
    ownerLabel: string | null;
    playCount: number;
    downloadedAt: string;
    // Stable fingerprint of the bundle's contents — derived from each
    // play's current_version_id. Lets the background-refresh loop ask
    // "is this still current?" without pulling the full bundle.
    signature: string;
  };
  plays: Array<{
    id: string;
    playbookId: string;
    name: string;
    wristbandCode: string | null;
    shorthand: string | null;
    playType: string;
    formationName: string | null;
    tags: string[] | null;
    isArchived: boolean;
  }>;
  documents: Array<{
    playId: string;
    playbookId: string;
    document: PlayDocument;
  }>;
};

/**
 * Bundle a playbook for offline use inside the native iOS/Android shell.
 * Returns playbook metadata, every active play (offense, defense, special
 * teams), and every play's full `PlayDocument` in a single payload so the
 * client can write it to IndexedDB in one transaction. Archived plays are
 * skipped — they're invisible in the normal UI, so caching them just
 * bloats the bundle.
 */
export async function getPlaybookOfflineBundleAction(
  playbookId: string,
): Promise<
  | { ok: true; bundle: OfflinePlaybookBundle }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { data: book } = await supabase
    .from("playbooks")
    .select("id, name, season, sport_variant, color, logo_url, is_example, is_public_example")
    .eq("id", playbookId)
    .maybeSingle();
  if (!book) return { ok: false, error: "Playbook not found." };

  const listed = await listPlaysAction(playbookId);
  if (!listed.ok) return { ok: false, error: listed.error };
  const plays = listed.plays.filter((p) => !p.is_archived);

  // Pull every current PlayDocument in two batched queries.
  const playIds = plays.map((p) => p.id);
  const versionByPlay = new Map<string, string>();
  if (playIds.length > 0) {
    const { data: rows } = await supabase
      .from("plays")
      .select("id, current_version_id")
      .in("id", playIds);
    for (const r of rows ?? []) {
      const vid = (r.current_version_id as string | null) ?? null;
      if (vid) versionByPlay.set(r.id as string, vid);
    }
  }

  const versionIds = Array.from(new Set(versionByPlay.values()));
  const docByVersion = new Map<string, PlayDocument>();
  if (versionIds.length > 0) {
    const { data: vrows } = await supabase
      .from("play_versions")
      .select("id, document")
      .in("id", versionIds);
    for (const v of vrows ?? []) {
      const d = v.document as PlayDocument | null;
      if (d) docByVersion.set(v.id as string, d);
    }
  }

  const documents: OfflinePlaybookBundle["documents"] = [];
  const playRows: OfflinePlaybookBundle["plays"] = [];
  for (const p of plays) {
    playRows.push({
      id: p.id,
      playbookId,
      name: p.name,
      wristbandCode: p.wristband_code,
      shorthand: p.shorthand,
      playType: p.play_type,
      formationName: p.formation_name,
      tags: p.tags ?? null,
      isArchived: p.is_archived,
    });
    const vid = versionByPlay.get(p.id);
    const doc = vid ? docByVersion.get(vid) : null;
    if (doc) documents.push({ playId: p.id, playbookId, document: doc });
  }

  return {
    ok: true,
    bundle: {
      meta: {
        id: playbookId,
        name: (book.name as string | null) ?? "Untitled",
        season: (book.season as string | null) ?? null,
        sportVariant: (book.sport_variant as string | null) ?? "flag_7v7",
        color: (book.color as string | null) || "#134e2a",
        logoUrl: (book.logo_url as string | null) ?? null,
        ownerLabel: null,
        playCount: documents.length,
        downloadedAt: new Date().toISOString(),
        signature: computeBundleSignature(plays, versionByPlay),
      },
      plays: playRows,
      documents,
    },
  };
}

/** Stable fingerprint over (playId → current_version_id). Sorted so the
 *  output is deterministic regardless of row order from Postgres. Two
 *  bundles with the same set of play versions share a signature; any
 *  edit that bumps a play's current_version_id changes it. */
function computeBundleSignature(
  plays: Array<{ id: string }>,
  versionByPlay: Map<string, string>,
): string {
  const parts = plays
    .map((p) => `${p.id}:${versionByPlay.get(p.id) ?? ""}`)
    .sort();
  return parts.join("|");
}

/**
 * Lightweight freshness check: returns just the bundle signature for a
 * playbook so the background-refresh loop can decide whether to pull the
 * full bundle. Reuses the same playlist + version lookup logic as
 * `getPlaybookOfflineBundleAction` but skips the document join, which is
 * the bulk of the bytes.
 */
export async function getPlaybookOfflineSignatureAction(
  playbookId: string,
): Promise<{ ok: true; signature: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { data: book } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .maybeSingle();
  if (!book) return { ok: false, error: "Playbook not found." };

  const listed = await listPlaysAction(playbookId);
  if (!listed.ok) return { ok: false, error: listed.error };
  const plays = listed.plays.filter((p) => !p.is_archived);

  const playIds = plays.map((p) => p.id);
  const versionByPlay = new Map<string, string>();
  if (playIds.length > 0) {
    const { data: rows } = await supabase
      .from("plays")
      .select("id, current_version_id")
      .in("id", playIds);
    for (const r of rows ?? []) {
      const vid = (r.current_version_id as string | null) ?? null;
      if (vid) versionByPlay.set(r.id as string, vid);
    }
  }

  return { ok: true, signature: computeBundleSignature(plays, versionByPlay) };
}

/**
 * IDs of every non-archived playbook the current coach can access (owned +
 * shared), mirroring getDashboardSummaryAction's membership read. The Phase 2
 * auto-cache loop seeds from this so "download for offline" becomes
 * "everything is already offline" — it walks each id, skips the ones whose
 * signature still matches the local copy, and bundles the rest.
 */
export async function listOfflinePlaybookIdsAction(): Promise<
  { ok: true; ids: string[] } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { data: rows, error } = await supabase
    .from("playbook_members")
    .select("playbooks!inner(id, is_archived)")
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  type Row = {
    playbooks:
      | { id: string; is_archived: boolean | null }
      | { id: string; is_archived: boolean | null }[]
      | null;
  };
  const ids: string[] = [];
  for (const r of (rows ?? []) as unknown as Row[]) {
    const b = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    if (b && !b.is_archived) ids.push(b.id);
  }
  return { ok: true, ids };
}
