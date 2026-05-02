import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { generateFeedbackClusters } from "@/lib/coach-ai/feedback-clusters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coach AI feedback clustering — recommended cadence: nightly, e.g. 03:00 UTC.
 *
 * Pulls recent failure signals (KB misses, refusals, thumbs-down) within the
 * last 30 days, asks the LLM to group them, and writes draft KB chunks into
 * `coach_ai_feedback_clusters` with status='pending' for site-admin review.
 *
 * Auth: header `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(req: Request): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 503 });
  }
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await generateFeedbackClusters(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cluster run failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
