/**
 * GET /api/photo-import/jobs/[jobId]
 *
 * Full job state for polling/resume: outcome fields when done, the
 * stored panel crop for the review screen's side-by-side, error text
 * when failed. Ownership enforced by user_id filter.
 */

import { NextResponse } from "next/server";
import { checkPhotoImportAccess } from "@/lib/coach-ai/photo-import/access";
import { getJob, JOB_STALE_MS } from "@/lib/coach-ai/photo-import/jobs";

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const access = await checkPhotoImportAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { jobId } = await ctx.params;
  const job = await getJob(access.userId, jobId);
  if (!job) return NextResponse.json({ error: "Import not found (it may have expired)." }, { status: 404 });

  return NextResponse.json({ job, staleMs: JOB_STALE_MS });
}
