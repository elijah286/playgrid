"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace, getOrCreateInboxPlaybook } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createEmptyPlayDocument, normalizePlayDocument } from "@/domain/play/factory";
import type { PlayDocument, Player, Route } from "@/domain/play/types";
import {
  compareNavPlays,
  type PlaybookGroupRow,
  type PlaybookPlayNavItem,
} from "@/domain/print/playbookPrint";

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
  preview: { players: Player[]; routes: Route[] } | null;
};

export async function listPlaysAction(
  playbookId: string,
  opts?: { includeArchived?: boolean },
): Promise<
  | { ok: true; plays: PlaybookDetailPlayRow[]; groups: PlaybookGroupRow[] }
  | { ok: false; error: string; plays: PlaybookDetailPlayRow[]; groups: PlaybookGroupRow[] }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured.", plays: [], groups: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in.", plays: [], groups: [] };

  let playsQ = supabase
    .from("plays")
    .select(
      "id, name, wristband_code, shorthand, concept, formation_name, tags, tag, group_id, sort_order, updated_at, current_version_id, is_archived",
    )
    .eq("playbook_id", playbookId)
    .order("updated_at", { ascending: false });

  if (!opts?.includeArchived) playsQ = playsQ.eq("is_archived", false);

  const [playsRes, groupsRes] = await Promise.all([
    playsQ,
    supabase
      .from("playbook_groups")
      .select("id, name, sort_order")
      .eq("playbook_id", playbookId)
      .order("sort_order", { ascending: true }),
  ]);

  if (playsRes.error) return { ok: false, error: playsRes.error.message, plays: [], groups: [] };
  if (groupsRes.error) return { ok: false, error: groupsRes.error.message, plays: [], groups: [] };

  const rawRows = playsRes.data ?? [];
  const versionIds = rawRows
    .map((r) => r.current_version_id as string | null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const previewByVersion = new Map<string, { players: Player[]; routes: Route[] }>();
  if (versionIds.length > 0) {
    const { data: versions } = await supabase
      .from("play_versions")
      .select("id, document")
      .in("id", versionIds);
    for (const v of versions ?? []) {
      const doc = v.document as PlayDocument | null;
      if (!doc) continue;
      previewByVersion.set(v.id as string, {
        players: doc.layers?.players ?? [],
        routes: doc.layers?.routes ?? [],
      });
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
      preview: vid ? previewByVersion.get(vid) ?? null : null,
    };
  });

  return {
    ok: true,
    plays,
    groups: (groupsRes.data ?? []) as PlaybookGroupRow[],
  };
}

export async function createPlayAction(playbookId: string, initialPlayers?: Player[]) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const doc = initialPlayers
    ? createEmptyPlayDocument({ layers: { players: initialPlayers, routes: [], annotations: [] } })
    : createEmptyPlayDocument();
  const { data: sortRow } = await supabase
    .from("plays")
    .select("sort_order")
    .eq("playbook_id", playbookId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (sortRow?.sort_order ?? -1) + 1;

  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: playbookId,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      concept: doc.metadata.concept,
      tags: doc.metadata.tags,
      tag: doc.metadata.tags[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      sort_order: nextSort,
    })
    .select("id")
    .single();

  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 1,
      document: doc as unknown as Record<string, unknown>,
      label: "v1",
      created_by: user.id,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: play, error } = await supabase
    .from("plays")
    .select(
      "id, playbook_id, name, wristband_code, shorthand, concept, tags, tag, formation_name, current_version_id",
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

  return {
    ok: true as const,
    play,
    version: ver,
    document: normalizePlayDocument(ver.document as PlayDocument),
  };
}

export async function savePlayVersionAction(
  playId: string,
  document: PlayDocument,
  label?: string,
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
    .select("id, playbook_id, current_version_id")
    .eq("id", playId)
    .single();
  if (pErr || !play) return { ok: false as const, error: pErr?.message ?? "Not found" };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: playId,
      schema_version: 1,
      document: document as unknown as Record<string, unknown>,
      parent_version_id: play.current_version_id,
      label: label ?? `save ${new Date().toISOString()}`,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase
    .from("plays")
    .update({
      current_version_id: ver.id,
      name: document.metadata.coachName,
      shorthand: document.metadata.shorthand,
      wristband_code: document.metadata.wristbandCode,
      formation_name: document.metadata.formation,
      concept: document.metadata.concept,
      tags: document.metadata.tags,
      tag: document.metadata.tags[0] ?? "",
      display_abbrev: document.metadata.sheetAbbrev,
    })
    .eq("id", playId);

  return { ok: true as const, versionId: ver.id };
}

export async function duplicatePlayAction(playId: string) {
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
    .select("playbook_id, group_id")
    .eq("id", playId)
    .single();
  if (srcPlayErr || !srcPlay) return { ok: false as const, error: "Not found" };

  const doc = structuredClone(loaded.document);
  doc.metadata.coachName = `${doc.metadata.coachName} (copy)`;

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
      concept: doc.metadata.concept,
      tags: doc.metadata.tags,
      tag: doc.metadata.tags[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      group_id: srcPlay.group_id,
      sort_order: dupSort,
    })
    .select("id")
    .single();

  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 1,
      document: doc as unknown as Record<string, unknown>,
      label: "duplicated",
      parent_version_id: loaded.version.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", play.id);

  return { ok: true as const, playId: play.id };
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

  const { error } = await supabase.from("plays").update({ name: trimmed }).eq("id", playId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function archivePlayAction(playId: string, archived: boolean) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

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

  const { error } = await supabase.from("plays").delete().eq("id", playId);
  if (error) return { ok: false as const, error: error.message };
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
  return createPlayAction(inboxId, initialPlayers);
}

export type DashboardSummary = {
  recentPlays: {
    id: string;
    name: string;
    concept: string | null;
    shorthand: string | null;
    wristband_code: string | null;
    updated_at: string | null;
    playbook_id: string;
    playbook_name: string;
  }[];
  playbooks: {
    id: string;
    name: string;
    is_default: boolean;
    updated_at: string | null;
    play_count: number;
  }[];
  totalPlays: number;
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

  const [playsRes, booksRes, countRes] = await Promise.all([
    supabase
      .from("plays")
      .select(
        "id, name, concept, shorthand, wristband_code, updated_at, playbook_id, playbooks!inner(name, is_archived)",
      )
      .eq("is_archived", false)
      .eq("playbooks.is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("playbooks")
      .select("id, name, is_default, updated_at")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false }),
    supabase
      .from("plays")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false),
  ]);

  if (playsRes.error) return { ok: false, error: playsRes.error.message };
  if (booksRes.error) return { ok: false, error: booksRes.error.message };

  // Per-playbook counts (single query, group client-side)
  const { data: allPlays } = await supabase
    .from("plays")
    .select("playbook_id")
    .eq("is_archived", false);
  const counts = new Map<string, number>();
  for (const row of allPlays ?? []) {
    counts.set(row.playbook_id, (counts.get(row.playbook_id) ?? 0) + 1);
  }

  type PlayJoin = {
    id: string;
    name: string;
    concept: string | null;
    shorthand: string | null;
    wristband_code: string | null;
    updated_at: string | null;
    playbook_id: string;
    playbooks: { name: string } | { name: string }[] | null;
  };

  const recentPlays = ((playsRes.data ?? []) as PlayJoin[]).map((r) => {
    const pb = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    return {
      id: r.id,
      name: r.name,
      concept: r.concept,
      shorthand: r.shorthand,
      wristband_code: r.wristband_code,
      updated_at: r.updated_at,
      playbook_id: r.playbook_id,
      playbook_name: pb?.name ?? "",
    };
  });

  const playbooks = (booksRes.data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    is_default: b.is_default as boolean,
    updated_at: b.updated_at as string | null,
    play_count: counts.get(b.id as string) ?? 0,
  }));

  return {
    ok: true,
    data: {
      recentPlays,
      playbooks,
      totalPlays: countRes.count ?? 0,
    },
  };
}

export async function listPlaybookPlaysForNavigationAction(playbookId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", plays: [], groups: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", plays: [], groups: [] };

  const [{ data: groups, error: gErr }, { data: rows, error: pErr }] = await Promise.all([
    supabase
      .from("playbook_groups")
      .select("id, name, sort_order")
      .eq("playbook_id", playbookId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("plays")
      .select(
        "id, name, wristband_code, shorthand, formation_name, concept, tags, tag, group_id, sort_order, current_version_id",
      )
      .eq("playbook_id", playbookId)
      .eq("is_archived", false),
  ]);

  if (gErr) return { ok: false as const, error: gErr.message, plays: [], groups: [] };
  if (pErr) return { ok: false as const, error: pErr.message, plays: [], groups: [] };

  const gMap = new Map((groups ?? []).map((g) => [g.id as string, g as PlaybookGroupRow]));
  const items: PlaybookPlayNavItem[] = (rows ?? []).map((row) => {
    const gid = (row.group_id as string | null) ?? null;
    const g = gid ? gMap.get(gid) : undefined;
    const tagsArr = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    const legacyTag = (row.tag as string | null) ?? "";
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
      current_version_id: (row.current_version_id as string) ?? null,
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Not signed in.", pack: [], groups: listed.groups };
  }

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
  return { ok: true as const, group: row as PlaybookGroupRow };
}

export async function setPlayGroupAction(playId: string, groupId: string | null) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase.from("plays").update({ group_id: groupId }).eq("id", playId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Ensure workspace for actions that need team context */
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
