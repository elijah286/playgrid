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
 * Returns playbook metadata, every offense play, and every play's full
 * `PlayDocument` in a single payload so the client can write it to
 * IndexedDB in one transaction.
 *
 * Defense + special-teams plays are intentionally excluded — game mode
 * (the offline use case) is offense-only today, and we don't want to ship
 * megabytes of unused data to the device.
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
  const plays = listed.plays.filter(
    (p) => p.play_type === "offense" && !p.is_archived,
  );

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
      },
      plays: playRows,
      documents,
    },
  };
}
