"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { PlayDocument } from "@/domain/play/types";
import { recordPlayVersion } from "@/lib/versions/play-version-writer";

export type PlayVersionRow = {
  id: string;
  playId: string;
  playName: string;
  createdAt: string;
  editorName: string | null;
  note: string | null;
  diffSummary: string | null;
  kind: "create" | "edit" | "restore";
  isCurrent: boolean;
};

export type PlaybookVersionRow = {
  id: string;
  createdAt: string;
  editorName: string | null;
  note: string | null;
  diffSummary: string | null;
  kind: "create" | "edit" | "restore";
};

// Recent edits across all plays in a playbook. Used by the History drawer's
// "Activity" tab — coaches see who changed what without having to drill into
// each play.
export async function listPlaybookActivityAction(
  playbookId: string,
  limit = 100,
): Promise<
  | { ok: true; rows: PlayVersionRow[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: plays, error: pErr } = await supabase
    .from("plays")
    .select("id, name, current_version_id")
    .eq("playbook_id", playbookId);
  if (pErr) return { ok: false, error: pErr.message };

  const playIds = (plays ?? []).map((p) => p.id as string);
  if (playIds.length === 0) return { ok: true, rows: [] };

  const nameById = new Map((plays ?? []).map((p) => [p.id as string, (p.name as string) || "Untitled play"]));
  const currentByPlay = new Map(
    (plays ?? []).map((p) => [p.id as string, (p.current_version_id as string | null) ?? null]),
  );

  const { data: versions, error: vErr } = await supabase
    .from("play_versions")
    .select("id, play_id, created_at, editor_name_snapshot, note, diff_summary, kind")
    .in("play_id", playIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (vErr) return { ok: false, error: vErr.message };

  const rows: PlayVersionRow[] = (versions ?? []).map((v) => ({
    id: v.id as string,
    playId: v.play_id as string,
    playName: nameById.get(v.play_id as string) ?? "Untitled play",
    createdAt: v.created_at as string,
    editorName: (v.editor_name_snapshot as string | null) ?? null,
    note: (v.note as string | null) ?? null,
    diffSummary: (v.diff_summary as string | null) ?? null,
    kind: ((v.kind as string) || "edit") as "create" | "edit" | "restore",
    isCurrent: currentByPlay.get(v.play_id as string) === (v.id as string),
  }));

  return { ok: true, rows };
}

export async function listPlayVersionsAction(
  playId: string,
): Promise<
  | { ok: true; rows: PlayVersionRow[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: play } = await supabase
    .from("plays")
    .select("name, current_version_id")
    .eq("id", playId)
    .maybeSingle();
  const currentId = (play?.current_version_id as string | null) ?? null;
  const playName = (play?.name as string) || "Untitled play";

  const { data: versions, error } = await supabase
    .from("play_versions")
    .select("id, play_id, created_at, editor_name_snapshot, note, diff_summary, kind")
    .eq("play_id", playId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const rows: PlayVersionRow[] = (versions ?? []).map((v) => ({
    id: v.id as string,
    playId: v.play_id as string,
    playName,
    createdAt: v.created_at as string,
    editorName: (v.editor_name_snapshot as string | null) ?? null,
    note: (v.note as string | null) ?? null,
    diffSummary: (v.diff_summary as string | null) ?? null,
    kind: ((v.kind as string) || "edit") as "create" | "edit" | "restore",
    isCurrent: currentId === (v.id as string),
  }));

  return { ok: true, rows };
}

// Returns the full PlayDocument for a given version. Used to render a play
// thumbnail or canvas at that point in time (compare view, restore preview).
export async function getPlayVersionDocumentAction(
  versionId: string,
): Promise<
  | { ok: true; document: PlayDocument }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("play_versions")
    .select("document")
    .eq("id", versionId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version not found." };
  return { ok: true, document: data.document as PlayDocument };
}

// Restore a play to a prior version's document. Creates a new version row
// (kind=restore) referencing the source — never mutates history.
export async function restorePlayVersionAction(
  playId: string,
  versionId: string,
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const [{ data: play }, { data: target }] = await Promise.all([
    supabase
      .from("plays")
      .select("playbook_id, current_version_id")
      .eq("id", playId)
      .maybeSingle(),
    supabase
      .from("play_versions")
      .select("id, document, created_at, editor_name_snapshot")
      .eq("id", versionId)
      .maybeSingle(),
  ]);
  if (!play) return { ok: false as const, error: "Play not found." };
  if (!target) return { ok: false as const, error: "Version not found." };

  const recorded = await recordPlayVersion({
    supabase,
    playId,
    document: target.document as PlayDocument,
    parentVersionId: (play.current_version_id as string | null) ?? null,
    userId: user.id,
    kind: "restore",
    label: "restored",
    restoredFromVersionId: versionId,
  });
  if (!recorded.ok) return { ok: false as const, error: recorded.error };

  const { error: updErr } = await supabase
    .from("plays")
    .update({ current_version_id: recorded.versionId })
    .eq("id", playId);
  if (updErr) return { ok: false as const, error: updErr.message };

  if (play.playbook_id) revalidatePath(`/playbooks/${play.playbook_id as string}`);
  return { ok: true as const, versionId: recorded.versionId };
}

export async function listPlaybookVersionsAction(
  playbookId: string,
): Promise<
  | { ok: true; rows: PlaybookVersionRow[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("playbook_versions")
    .select("id, created_at, editor_name_snapshot, note, diff_summary, kind")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  const rows: PlaybookVersionRow[] = (data ?? []).map((v) => ({
    id: v.id as string,
    createdAt: v.created_at as string,
    editorName: (v.editor_name_snapshot as string | null) ?? null,
    note: (v.note as string | null) ?? null,
    diffSummary: (v.diff_summary as string | null) ?? null,
    kind: ((v.kind as string) || "edit") as "create" | "edit" | "restore",
  }));

  return { ok: true, rows };
}
