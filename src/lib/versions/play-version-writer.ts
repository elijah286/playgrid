import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayDocument } from "@/domain/play/types";
import { summarizePlayDiff } from "@/lib/versions/play-diff";

type RecordKind = "create" | "edit" | "restore";

type RecordArgs = {
  supabase: SupabaseClient;
  playId: string;
  document: PlayDocument;
  parentVersionId: string | null;
  userId: string;
  kind: RecordKind;
  note?: string | null;
  label?: string | null;
  restoredFromVersionId?: string | null;
  schemaVersion?: number;
};

type RecordResult =
  | { ok: true; versionId: string; deduped: boolean }
  | { ok: false; error: string };

export async function recordPlayVersion(args: RecordArgs): Promise<RecordResult> {
  const {
    supabase,
    playId,
    document,
    parentVersionId,
    userId,
    kind,
    note,
    label,
    restoredFromVersionId,
    schemaVersion = 2,
  } = args;

  let parentDoc: PlayDocument | null = null;
  if (parentVersionId) {
    const { data: parent } = await supabase
      .from("play_versions")
      .select("document")
      .eq("id", parentVersionId)
      .maybeSingle();
    parentDoc = (parent?.document as PlayDocument | undefined) ?? null;
  }

  // Dedupe: byte-identical document → return parent as the "current" version.
  // Only short-circuits "edit" saves; create/restore always materialize.
  if (kind === "edit" && parentVersionId && parentDoc) {
    if (canonicalJson(parentDoc) === canonicalJson(document)) {
      return { ok: true, versionId: parentVersionId, deduped: true };
    }
  }

  const editorName = await lookupDisplayName(supabase, userId);
  const diffSummary = parentDoc ? summarizePlayDiff(parentDoc, document) : null;

  const { data, error } = await supabase
    .from("play_versions")
    .insert({
      play_id: playId,
      schema_version: schemaVersion,
      document: document as unknown as Record<string, unknown>,
      parent_version_id: parentVersionId,
      label: label ?? null,
      created_by: userId,
      editor_name_snapshot: editorName,
      kind,
      note: note ?? null,
      diff_summary: diffSummary,
      restored_from_version_id: restoredFromVersionId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to record version" };
  }
  return { ok: true, versionId: data.id as string, deduped: false };
}

async function lookupDisplayName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const name = (data?.display_name as string | null | undefined) ?? null;
  return name && name.trim().length > 0 ? name.trim() : null;
}

// Stable JSON for hashing/dedupe. Sorts object keys at every depth.
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
    return out;
  }
  return value;
}
