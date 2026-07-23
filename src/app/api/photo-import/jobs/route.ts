/**
 * GET /api/photo-import/jobs
 *
 * Recent import jobs for the signed-in coach across EVERY playbook, so
 * the import page can offer "Recent imports" after they left mid-read —
 * wherever that read was. Also performs the lazy 24h retention sweep.
 */

import { NextResponse } from "next/server";
import { checkPhotoImportAccess } from "@/lib/coach-ai/photo-import/access";
import { listJobs, JOB_STALE_MS } from "@/lib/coach-ai/photo-import/jobs";

export async function GET() {
  const access = await checkPhotoImportAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const jobs = await listJobs(access.userId);
  return NextResponse.json({ jobs, staleMs: JOB_STALE_MS });
}
