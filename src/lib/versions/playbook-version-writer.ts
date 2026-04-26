import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  summarizePlaybookStructureDiff,
  type PlaybookSnapshotDoc,
} from "@/lib/versions/playbook-structure-diff";

// Snapshots playbook structure (groups + play ordering, not play contents).
// Called after structural mutations (group create/rename/delete/reorder,
// play group/sort changes). Dedupes when the resulting document matches
// the previous version.

type PlaybookDocument = {
  groups: { id: string; name: string; sort_order: number }[];
  plays: { id: string; group_id: string | null; sort_order: number; name: string }[];
};

type RecordKind = "create" | "edit" | "restore";

type RecordArgs = {
  supabase: SupabaseClient;
  playbookId: string;
  userId: string;
  kind: RecordKind;
  note?: string | null;
  diffSummary?: string | null;
  restoredFromVersionId?: string | null;
};

export async function recordPlaybookVersion(args: RecordArgs): Promise<void> {
  const { supabase, playbookId, userId, kind, note, diffSummary, restoredFromVersionId } = args;

  const document = await snapshotPlaybook(supabase, playbookId);

  // Find latest version for parent + dedupe.
  const { data: prev } = await supabase
    .from("playbook_versions")
    .select("id, document")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parentVersionId = (prev?.id as string | null) ?? null;
  if (kind === "edit" && prev?.document) {
    if (canonicalJson(prev.document) === canonicalJson(document)) return;
  }

  const editorName = await lookupDisplayName(supabase, userId);

  // Auto-compute detailed diff summary if caller didn't supply one.
  let finalDiffSummary = diffSummary ?? null;
  if (!finalDiffSummary) {
    const prevDoc = (prev?.document as PlaybookSnapshotDoc | null) ?? null;
    const lines = summarizePlaybookStructureDiff(prevDoc, document);
    if (lines.length > 0) finalDiffSummary = lines.join("\n");
  }

  await supabase.from("playbook_versions").insert({
    playbook_id: playbookId,
    schema_version: 1,
    document: document as unknown as Record<string, unknown>,
    parent_version_id: parentVersionId,
    note: note ?? null,
    diff_summary: finalDiffSummary,
    kind,
    restored_from_version_id: restoredFromVersionId ?? null,
    created_by: userId,
    editor_name_snapshot: editorName,
  });
}

async function snapshotPlaybook(
  supabase: SupabaseClient,
  playbookId: string,
): Promise<PlaybookDocument> {
  const [{ data: groups }, { data: plays }] = await Promise.all([
    supabase
      .from("playbook_groups")
      .select("id, name, sort_order")
      .eq("playbook_id", playbookId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("plays")
      .select("id, group_id, sort_order, name")
      .eq("playbook_id", playbookId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    groups: (groups ?? []).map((g) => ({
      id: g.id as string,
      name: (g.name as string) ?? "",
      sort_order: (g.sort_order as number) ?? 0,
    })),
    plays: (plays ?? []).map((p) => ({
      id: p.id as string,
      group_id: (p.group_id as string | null) ?? null,
      sort_order: (p.sort_order as number) ?? 0,
      name: (p.name as string) ?? "",
    })),
  };
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
  if (name && name.trim().length > 0) return name.trim();

  try {
    const admin = createServiceRoleClient();
    const { data: au } = await admin.auth.admin.getUserById(userId);
    const u = au?.user;
    const full = (u?.user_metadata?.full_name as string | undefined) ?? null;
    if (full && full.trim().length > 0) return full.trim();
    if (u?.email) return u.email;
  } catch {
    // ignore
  }
  return null;
}

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
