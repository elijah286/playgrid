import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ingest endpoint for the functional-testing harness.
 *
 * GitHub Actions runs headless Playwright scenarios against production, then its
 * reporter POSTs one run payload here (steps + base64 PNGs). We upload each
 * screenshot to the public `test-screenshots` bucket and persist the run + steps
 * so the Site Admin "Functional Testing" tab can render results and the gallery.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` — same machine-caller pattern as
 * the cron routes (e.g. /api/push/admin-notices). Writes use the service-role
 * client, which bypasses the admin-only RLS on the functional_test_* tables.
 */

const BUCKET = "test-screenshots";

type IngestStep = {
  scenario: string;
  stepName: string;
  ordinal: number;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
  errorMessage?: string;
  /** Base64-encoded PNG (no data: prefix). Omitted for steps without a shot. */
  screenshotBase64?: string;
};

type IngestPayload = {
  gitSha?: string;
  trigger?: "post_deploy" | "nightly" | "manual";
  environment?: string;
  status: "passed" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  steps: IngestStep[];
};

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "step"
  );
}

async function handle(req: Request): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 503 });
  }
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim();
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: IngestPayload;
  try {
    payload = (await req.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !payload ||
    (payload.status !== "passed" && payload.status !== "failed") ||
    !Array.isArray(payload.steps)
  ) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const steps = payload.steps;
  const failedSteps = steps.filter((s) => s.status === "failed").length;

  const { data: runRow, error: runErr } = await admin
    .from("functional_test_runs")
    .insert({
      git_sha: payload.gitSha ?? null,
      trigger: payload.trigger ?? "manual",
      status: payload.status,
      environment: payload.environment ?? null,
      started_at: payload.startedAt,
      finished_at: payload.finishedAt,
      duration_ms: payload.durationMs ?? 0,
      total_steps: steps.length,
      failed_steps: failedSteps,
      meta: payload.meta ?? {},
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return NextResponse.json(
      { ok: false, error: runErr?.message ?? "Failed to insert run" },
      { status: 500 },
    );
  }
  const runId = runRow.id as string;

  // Upload screenshots, then insert step rows in order. Screenshot upload is
  // best-effort: a failed upload leaves screenshot_url null but never drops the
  // step (the timing + status are still the useful signal).
  const stepRows: Array<Record<string, unknown>> = [];
  for (const s of steps) {
    let screenshotUrl: string | null = null;
    if (s.screenshotBase64) {
      try {
        const bytes = Buffer.from(s.screenshotBase64, "base64");
        const key = `${runId}/${String(s.ordinal).padStart(3, "0")}-${slugify(s.stepName)}.png`;
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(key, bytes, { contentType: "image/png", upsert: true });
        if (!upErr) {
          const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);
          screenshotUrl = pub.publicUrl ?? null;
        }
      } catch {
        screenshotUrl = null;
      }
    }
    stepRows.push({
      run_id: runId,
      scenario: s.scenario,
      step_name: s.stepName,
      ordinal: s.ordinal,
      status: s.status,
      duration_ms: s.durationMs ?? null,
      screenshot_url: screenshotUrl,
      error_message: s.errorMessage ?? null,
    });
  }

  if (stepRows.length > 0) {
    const { error: stepsErr } = await admin.from("functional_test_steps").insert(stepRows);
    if (stepsErr) {
      return NextResponse.json({ ok: false, error: stepsErr.message, runId }, { status: 500 });
    }
  }

  // On failure, raise a site-admin notice so admins get pushed through the same
  // pipeline as signups/cancellations (functional_test_failed is in
  // ADMIN_PUSH_NOTICE_KINDS). Best-effort — never fail the ingest over it.
  if (payload.status === "failed") {
    const failedScenarios = Array.from(
      new Set(steps.filter((s) => s.status === "failed").map((s) => s.scenario)),
    );
    const where = payload.environment ? ` on ${payload.environment}` : "";
    const body =
      `Functional tests failed${where}: ` +
      (failedScenarios.length > 0 ? failedScenarios.join(", ") : "see run") +
      ` (${failedSteps}/${steps.length} steps).`;
    await admin
      .from("system_notices")
      .insert({
        kind: "functional_test_failed",
        severity: "critical",
        body,
        href: "/settings?tab=functional_tests",
        detail: {
          run_id: runId,
          git_sha: payload.gitSha ?? null,
          failed_scenarios: failedScenarios,
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return NextResponse.json({ ok: true, runId, steps: stepRows.length });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
