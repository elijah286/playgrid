import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayDocument } from "@/domain/play/types";
import { parsePlayDocumentStrict } from "@/domain/play/schema";
import { summarizePlayDiff } from "@/lib/versions/play-diff";
import { createServiceRoleClient } from "@/lib/supabase/admin";

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

  // SCHEMA SAVE BOUNDARY (AGENTS.md Rule: strict at write).
  // Validate the document against the canonical PlayDocument schema
  // BEFORE persisting. Anything that fails here is a code bug — the
  // converter or some upstream caller produced data that doesn't
  // match the contract. Reject loudly with structured errors rather
  // than committing corrupt rows that would later cause weird
  // renderings (the LT-on-LG / blue-rectangle / H2-color class).
  const validated = parsePlayDocumentStrict(document);
  if (!validated.success) {
    const issues = validated.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      error:
        `PlayDocument failed schema validation — refusing to save corrupt data. ` +
        `Issues: ${issues}${validated.error.issues.length > 6 ? `, +${validated.error.issues.length - 6} more` : ""}.`,
    };
  }

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
  if (name && name.trim().length > 0) return name.trim();

  // Fall back to the auth user's email/full_name. profiles.display_name can be
  // null for legacy accounts that pre-date the on-signup trigger, or if the
  // user cleared their display name. Going to auth.users keeps the history log
  // attributable instead of showing "Unknown editor".
  try {
    const admin = createServiceRoleClient();
    const { data: au } = await admin.auth.admin.getUserById(userId);
    const u = au?.user;
    const full = (u?.user_metadata?.full_name as string | undefined) ?? null;
    if (full && full.trim().length > 0) return full.trim();
    if (u?.email) return u.email;
  } catch {
    // ignore — we'll just return null and the UI will show "Unknown editor"
  }
  return null;
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
