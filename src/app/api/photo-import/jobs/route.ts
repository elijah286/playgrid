/**
 * GET /api/photo-import/jobs?playbookId=…
 *
 * Recent import jobs for the signed-in coach in one playbook, so the
 * import page can offer "Recent imports" after they left mid-read.
 * Also performs the lazy 24h retention sweep for this user.
 */

import { NextResponse } from "next/server";
import { checkPhotoImportAccess } from "@/lib/coach-ai/photo-import/access";
import { listJobs, JOB_STALE_MS } from "@/lib/coach-ai/photo-import/jobs";

export async function GET(req: Request) {
  const access = await checkPhotoImportAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const playbookId = new URL(req.url).searchParams.get("playbookId");
  if (!playbookId) return NextResponse.json({ error: "playbookId is required." }, { status: 400 });

  const jobs = await listJobs(access.userId, playbookId);
  return NextResponse.json({ jobs, staleMs: JOB_STALE_MS });
}
