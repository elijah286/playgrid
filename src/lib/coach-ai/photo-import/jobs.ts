/**
 * Server-persisted import jobs (photo_import_jobs).
 *
 * Why: the vision read takes 20-60s, and coaches — especially on a
 * phone — leave the page or background the app. The job row keeps the
 * crop + the outcome server-side so the import survives the departure:
 * the import page lists recent jobs, a returning coach resumes a
 * finished one instantly, and a stalled/errored one can retry from the
 * stored crop without re-uploading.
 *
 * Persistence is BEST-EFFORT: if the table is missing or an insert
 * fails, the synchronous import path still works exactly as before —
 * job rows are a recovery convenience, never a dependency.
 *
 * Retention: rows (crop included) are lazily deleted 24h after
 * creation, in listJobs. Only service-role code touches the table;
 * every helper filters by user_id.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { PlaySpec } from "@/domain/play/spec";
import type { PlayExtraction } from "./schema";
import type { ImportWarning, PlayerMapping } from "./synthesize";
import type { VariantMismatch } from "./run-import";

/** A job still "running" but untouched for this long is presumed dead
 *  (the original request lost its client and was killed) — the UI
 *  offers a retry. */
export const JOB_STALE_MS = 150_000;

const JOB_TTL_HOURS = 24;

export type PhotoImportJobSummary = {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  hasMismatch: boolean;
  /** Offensive players the read found — shown on the recent-imports card
   *  so a coach can tell formats apart at a glance. Null while running. */
  playerCount: number | null;
  /** Which playbook the import belongs to (recent imports span every
   *  playbook now), so a card can name its home and route back to it. */
  playbookId: string;
  playbookName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PhotoImportJob = PhotoImportJobSummary & {
  playbookId: string;
  cropBase64: string | null;
  mediaType: string | null;
  extraction: PlayExtraction | null;
  spec: PlaySpec | null;
  mapping: PlayerMapping[] | null;
  warnings: ImportWarning[] | null;
  variantMismatch: VariantMismatch | null;
  error: string | null;
  attempts: number;
};

type JobOutcome =
  | { status: "done"; extraction: PlayExtraction; spec: PlaySpec; mapping: PlayerMapping[]; warnings: ImportWarning[] }
  | {
      status: "done";
      extraction: PlayExtraction;
      variantMismatch: VariantMismatch;
      /** Draft against the inferred variant, persisted so a resumed
       *  mismatch can offer the create/import CTAs (null when the count
       *  matches no supported variant). */
      spec: PlaySpec | null;
      mapping: PlayerMapping[] | null;
      warnings: ImportWarning[] | null;
    }
  | { status: "error"; error: string };

export async function createJob(opts: {
  userId: string;
  playbookId: string;
  label: string;
  cropBase64: string;
  mediaType: string;
}): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("photo_import_jobs")
      .insert({
        user_id: opts.userId,
        playbook_id: opts.playbookId,
        label: opts.label,
        status: "running",
        crop_base64: opts.cropBase64,
        media_type: opts.mediaType,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch (err) {
    console.warn(`[photo-import] job insert failed (continuing without persistence): ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function finishJob(jobId: string | null, outcome: JobOutcome): Promise<void> {
  if (!jobId) return;
  try {
    const admin = createServiceRoleClient();
    const patch: Record<string, unknown> = { status: outcome.status, updated_at: new Date().toISOString() };
    if (outcome.status === "error") {
      patch.error = outcome.error;
    } else {
      patch.extraction = outcome.extraction;
      patch.error = null;
      if ("variantMismatch" in outcome) {
        // Persist the draft alongside the mismatch so a resumed job can
        // still offer "create/import into a compatible playbook".
        patch.variant_mismatch = outcome.variantMismatch;
        patch.spec = outcome.spec;
        patch.mapping = outcome.mapping;
        patch.warnings = outcome.warnings;
      } else {
        patch.spec = outcome.spec;
        patch.mapping = outcome.mapping;
        patch.warnings = outcome.warnings;
        patch.variant_mismatch = null;
      }
    }
    await admin.from("photo_import_jobs").update(patch).eq("id", jobId);
  } catch (err) {
    console.warn(`[photo-import] job update failed for ${jobId}: ${err instanceof Error ? err.message : err}`);
  }
}

function rowToJob(row: Record<string, unknown>): PhotoImportJob {
  return {
    id: row.id as string,
    playbookId: row.playbook_id as string,
    label: (row.label as string) ?? "Imported play",
    status: row.status as PhotoImportJob["status"],
    hasMismatch: row.variant_mismatch != null,
    playerCount: jobPlayerCount(row),
    // The single-job fetch doesn't join the playbook name (resume doesn't
    // need it — the list view supplies it). Kept null to satisfy the shared
    // summary shape.
    playbookName: null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    cropBase64: (row.crop_base64 as string | null) ?? null,
    mediaType: (row.media_type as string | null) ?? null,
    extraction: (row.extraction as PlayExtraction | null) ?? null,
    spec: (row.spec as PlaySpec | null) ?? null,
    mapping: (row.mapping as PlayerMapping[] | null) ?? null,
    warnings: (row.warnings as ImportWarning[] | null) ?? null,
    variantMismatch: (row.variant_mismatch as VariantMismatch | null) ?? null,
    error: (row.error as string | null) ?? null,
    attempts: (row.attempts as number) ?? 1,
  };
}

/** Offensive players a finished read found — from the draft extraction,
 *  or the mismatch's observed count when the play didn't fit. Null while
 *  still running (nothing read yet). */
function jobPlayerCount(row: Record<string, unknown>): number | null {
  const extraction = row.extraction as { players?: unknown[] } | null;
  if (extraction?.players && Array.isArray(extraction.players)) return extraction.players.length;
  const vm = row.variant_mismatch as { photoPlayers?: number } | null;
  if (vm && typeof vm.photoPlayers === "number") return vm.photoPlayers;
  return null;
}

export async function listJobs(userId: string): Promise<PhotoImportJobSummary[]> {
  try {
    const admin = createServiceRoleClient();
    // Lazy retention: this user's expired rows go first (crop included).
    const cutoff = new Date(Date.now() - JOB_TTL_HOURS * 3600_000).toISOString();
    await admin.from("photo_import_jobs").delete().eq("user_id", userId).lt("created_at", cutoff);

    // Recent imports span EVERY playbook the coach imported into (not just
    // the one they're viewing) — the whole point is to pick work back up
    // wherever they left it.
    const { data, error } = await admin
      .from("photo_import_jobs")
      .select("id, label, status, variant_mismatch, extraction, playbook_id, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];

    // Resolve playbook names in one batched read (service role — the jobs
    // are already scoped to this user, so their books are fair to name).
    const bookIds = Array.from(new Set(rows.map((r) => r.playbook_id as string).filter(Boolean)));
    const nameById = new Map<string, string>();
    if (bookIds.length > 0) {
      const { data: books } = await admin.from("playbooks").select("id, name").in("id", bookIds);
      for (const b of (books ?? []) as { id: string; name: string | null }[]) {
        nameById.set(b.id, b.name ?? "Untitled playbook");
      }
    }

    return rows.map((row) => ({
      id: row.id as string,
      label: (row.label as string) ?? "Imported play",
      status: row.status as PhotoImportJobSummary["status"],
      hasMismatch: row.variant_mismatch != null,
      playerCount: jobPlayerCount(row),
      playbookId: row.playbook_id as string,
      playbookName: nameById.get(row.playbook_id as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  } catch (err) {
    console.warn(`[photo-import] job list failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function getJob(userId: string, jobId: string): Promise<PhotoImportJob | null> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("photo_import_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToJob(data as Record<string, unknown>) : null;
  } catch (err) {
    console.warn(`[photo-import] job fetch failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Claim a job for retry: allowed when errored, or still "running" but
 * stale (the original request presumably died with its client). The
 * optimistic updated_at match prevents two tabs from double-claiming
 * (and double-billing) the same retry.
 */
export async function claimJobForRetry(
  userId: string,
  jobId: string,
): Promise<{ ok: true; job: PhotoImportJob } | { ok: false; error: string }> {
  const job = await getJob(userId, jobId);
  if (!job) return { ok: false, error: "Import not found (it may have expired)." };
  if (job.status === "done") return { ok: false, error: "This import already finished." };
  if (!job.cropBase64 || !job.mediaType) return { ok: false, error: "The stored panel expired — start a new import." };
  if (job.attempts >= 3) return { ok: false, error: "This import already retried twice — start a new one." };
  const stale = Date.now() - new Date(job.updatedAt).getTime() > JOB_STALE_MS;
  if (job.status === "running" && !stale) return { ok: false, error: "This import is still working — give it a moment." };

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("photo_import_jobs")
      .update({ status: "running", attempts: job.attempts + 1, error: null, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", userId)
      .eq("updated_at", job.updatedAt)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "Another tab already retried this import." };
    return { ok: true, job };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't claim the retry." };
  }
}
