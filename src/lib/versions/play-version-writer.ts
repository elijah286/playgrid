import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayDocument } from "@/domain/play/types";
import { parsePlayDocumentStrict } from "@/domain/play/schema";
import { summarizePlayDiff } from "@/lib/versions/play-diff";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type RecordKind = "create" | "edit" | "restore";
type Actor = "user" | "ai";

type RecordArgs = {
  supabase: SupabaseClient;
  playId: string;
  document: PlayDocument;
  parentVersionId: string | null;
  userId: string;
  kind: RecordKind;
  actor?: Actor;
  note?: string | null;
  label?: string | null;
  restoredFromVersionId?: string | null;
  schemaVersion?: number;
};

type RecordResult =
  | { ok: true; versionId: string; deduped: boolean; coalesced?: boolean }
  | { ok: false; error: string };

// How long after the previous user edit on the same play we'll keep folding
// new edits into that row. 5 minutes is long enough to absorb a typical
// drag-fest editing session, short enough that "I came back after lunch"
// becomes its own history entry.
const COALESCE_WINDOW_MS = 5 * 60 * 1000;

export async function recordPlayVersion(args: RecordArgs): Promise<RecordResult> {
  const {
    supabase,
    playId,
    document,
    parentVersionId,
    userId,
    kind,
    actor = "user",
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

  // Coalesce: a user editing the same play within COALESCE_WINDOW_MS of
  // their previous user-authored edit folds into that row instead of
  // inserting a new one. AI (Coach Cal) edits never coalesce — they
  // always materialize as a distinct row so attribution stays clean.
  // Labeled saves and restores also never coalesce.
  if (kind === "edit" && actor === "user" && !label && parentVersionId) {
    const coalesceTarget = await loadCoalesceCandidate({
      supabase,
      playId,
      userId,
      windowMs: COALESCE_WINDOW_MS,
    });
    if (coalesceTarget && coalesceTarget.id === parentVersionId) {
      // Recompute the diff against the version BEFORE the editing
      // session started — i.e. the coalesce target's own parent. The
      // surviving row should reflect the total session change, not
      // the last tick.
      let preSessionDoc: PlayDocument | null = null;
      if (coalesceTarget.parent_version_id) {
        const { data: gp } = await supabase
          .from("play_versions")
          .select("document")
          .eq("id", coalesceTarget.parent_version_id)
          .maybeSingle();
        preSessionDoc = (gp?.document as PlayDocument | undefined) ?? null;
      }
      const diffSummary = preSessionDoc ? summarizePlayDiff(preSessionDoc, document) : null;

      const { error: updErr } = await supabase
        .from("play_versions")
        .update({
          document: document as unknown as Record<string, unknown>,
          diff_summary: diffSummary,
          // Bump created_at so the timeline shows the session's most
          // recent activity. The id and parent_version_id stay the
          // same — the version chain is unchanged.
          created_at: new Date().toISOString(),
        })
        .eq("id", coalesceTarget.id);
      if (updErr) {
        return { ok: false, error: updErr.message };
      }
      return { ok: true, versionId: coalesceTarget.id, deduped: false, coalesced: true };
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
      actor,
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

async function loadCoalesceCandidate(args: {
  supabase: SupabaseClient;
  playId: string;
  userId: string;
  windowMs: number;
}): Promise<{ id: string; parent_version_id: string | null } | null> {
  const { supabase, playId, userId, windowMs } = args;
  const { data } = await supabase
    .from("play_versions")
    .select("id, parent_version_id, created_by, created_at, kind, actor, label")
    .eq("play_id", playId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.kind !== "edit") return null;
  if (data.actor !== "user") return null;
  if (data.label) return null;
  if (data.created_by !== userId) return null;
  const createdAt = new Date(data.created_at as string).getTime();
  if (!Number.isFinite(createdAt)) return null;
  if (Date.now() - createdAt > windowMs) return null;
  return {
    id: data.id as string,
    parent_version_id: (data.parent_version_id as string | null) ?? null,
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
