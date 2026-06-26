/**
 * Custom Playwright reporter for the functional-testing harness.
 *
 * It collects the per-test `functest-steps` JSON attachments (written by the
 * Recorder fixture in ./_helpers.ts), flattens them into one run, and POSTs that
 * run to the app's ingest endpoint (Bearer CRON_SECRET). Emitting from the
 * reporter — not from inside each test — guarantees a single atomic submission
 * for the whole run, even when a scenario fails midway.
 *
 * Env: INGEST_URL, CRON_SECRET (required to ingest); BASE_URL, GITHUB_SHA,
 * FUNCTEST_TRIGGER (metadata). With no INGEST_URL/CRON_SECRET it logs and skips,
 * so local runs work without ingesting.
 */
import { readFileSync } from "node:fs";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import type { StepRecord } from "./_helpers";

export default class FunctestReporter implements Reporter {
  private steps: StepRecord[] = [];
  private startedAtMs = Date.now();
  private sawFailure = false;

  onBegin(): void {
    this.startedAtMs = Date.now();
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    if (result.status !== "passed") this.sawFailure = true;
    const att = result.attachments.find((a) => a.name === "functest-steps");
    if (!att) return;
    try {
      const raw = att.body
        ? att.body.toString("utf8")
        : att.path
          ? readFileSync(att.path, "utf8")
          : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as StepRecord[];
      if (Array.isArray(parsed)) this.steps.push(...parsed);
    } catch {
      /* a malformed attachment shouldn't sink the whole report */
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const finishedAtMs = Date.now();
    // Re-number ordinals across the whole run so the admin gallery is sequential.
    const steps = this.steps.map((s, i) => ({ ...s, ordinal: i + 1 }));
    const failed =
      this.sawFailure || result.status !== "passed" || steps.some((s) => s.status === "failed");

    const meta: Record<string, unknown> = { browser: "chromium" };

    // Assemble one animated GIF per scenario from its step screenshots — a quick
    // visual summary of each workflow. Uploaded via service-role (available both
    // locally and in CI); the URLs ride in meta.gifs, which both ingest paths
    // already persist. Skipped if no service-role key (the GIF can't be stored).
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const prefix = `${this.startedAtMs}-${(process.env.GITHUB_SHA || process.env.GIT_SHA || "local").slice(0, 7)}`;
      try {
        const gifs = await buildScenarioGifs(steps, prefix);
        if (Object.keys(gifs).length) meta.gifs = gifs;
      } catch (e) {
        console.error("[functest-reporter] gif assembly failed:", e);
      }
    }

    const payload = {
      gitSha: process.env.GITHUB_SHA || process.env.GIT_SHA || null,
      trigger: process.env.FUNCTEST_TRIGGER || "manual",
      environment: process.env.BASE_URL || "",
      status: failed ? "failed" : "passed",
      startedAt: new Date(this.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - this.startedAtMs,
      meta,
      steps,
    };

    // Production path (CI): POST to the authenticated ingest endpoint.
    const ingestUrl = process.env.INGEST_URL;
    const secret = process.env.CRON_SECRET;
    if (ingestUrl && secret) {
      try {
        const res = await fetch(ingestUrl, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
          body: JSON.stringify(payload),
        });
        const text = await res.text().catch(() => "");
        console.log(`[functest-reporter] ingest → ${res.status} ${text.slice(0, 200)}`);
      } catch (e) {
        console.error("[functest-reporter] ingest POST failed:", e);
      }
      return;
    }

    // Local fallback: no CRON_SECRET, but a service-role key is available — write
    // straight to Supabase (same effect as the endpoint) so a local run still
    // populates the Functional Testing dashboard.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const n = await directWrite(payload);
        console.log(`[functest-reporter] direct-write → run + ${n} steps to Supabase`);
      } catch (e) {
        console.error("[functest-reporter] direct-write failed:", e);
      }
      return;
    }

    console.log(
      `[functest-reporter] ${payload.status} — ${steps.length} steps. No INGEST_URL/CRON_SECRET or service-role key; skipping ingest.`,
    );
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "step";
}

/**
 * Build one animated GIF per scenario from its step screenshots (a quick visual
 * summary of each workflow) and upload them to the test-screenshots bucket.
 * Returns { scenario: publicUrl }. Uses sharp's animated-join (already a dep).
 */
async function buildScenarioGifs(
  steps: StepRecord[],
  prefix: string,
): Promise<Record<string, string>> {
  const [{ createClient }, sharpMod] = await Promise.all([
    import("@supabase/supabase-js"),
    import("sharp"),
  ]);
  const sharp = sharpMod.default;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Group frames by scenario, preserving step order.
  const byScenario = new Map<string, StepRecord[]>();
  for (const s of steps) {
    if (!s.screenshotBase64) continue;
    const arr = byScenario.get(s.scenario) ?? [];
    arr.push(s);
    byScenario.set(s.scenario, arr);
  }

  const out: Record<string, string> = {};
  for (const [scenario, scSteps] of byScenario) {
    if (scSteps.length === 0) continue;
    try {
      // Resize each frame to a uniform width first (smaller GIF, and join needs
      // matching dimensions). Hold each frame ~1.5s so the summary is readable.
      const frames = await Promise.all(
        scSteps.map((s) =>
          sharp(Buffer.from(s.screenshotBase64!, "base64"))
            .resize({ width: 900 })
            .png()
            .toBuffer(),
        ),
      );
      const gif = await sharp(frames, { join: { animated: true } })
        .gif({ delay: scSteps.map(() => 1500), loop: 0 })
        .toBuffer();
      const key = `gifs/${prefix}-${slug(scenario)}.gif`;
      const { error } = await admin.storage
        .from("test-screenshots")
        .upload(key, gif, { contentType: "image/gif", upsert: true });
      if (!error) {
        out[scenario] = admin.storage.from("test-screenshots").getPublicUrl(key).data.publicUrl;
      }
    } catch (e) {
      console.error(`[functest-reporter] gif(${scenario}) failed:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** Mirror of the ingest endpoint's write path, for local runs without CRON_SECRET. */
async function directWrite(payload: {
  gitSha: string | null;
  trigger: string;
  environment: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  meta: Record<string, unknown>;
  steps: StepRecord[];
}): Promise<number> {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const failedSteps = payload.steps.filter((s) => s.status === "failed").length;
  const { data: run, error: runErr } = await admin
    .from("functional_test_runs")
    .insert({
      git_sha: payload.gitSha,
      trigger: payload.trigger,
      status: payload.status,
      environment: payload.environment,
      started_at: payload.startedAt,
      finished_at: payload.finishedAt,
      duration_ms: payload.durationMs,
      total_steps: payload.steps.length,
      failed_steps: failedSteps,
      meta: payload.meta,
    })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "run insert failed");
  const runId = run.id as string;

  for (const s of payload.steps) {
    let screenshotUrl: string | null = null;
    if (s.screenshotBase64) {
      const bytes = Buffer.from(s.screenshotBase64, "base64");
      const key = `${runId}/${String(s.ordinal).padStart(3, "0")}-${slug(s.stepName)}.png`;
      const { error } = await admin.storage
        .from("test-screenshots")
        .upload(key, bytes, { contentType: "image/png", upsert: true });
      if (!error) screenshotUrl = admin.storage.from("test-screenshots").getPublicUrl(key).data.publicUrl;
    }
    await admin.from("functional_test_steps").insert({
      run_id: runId,
      scenario: s.scenario,
      step_name: s.stepName,
      ordinal: s.ordinal,
      status: s.status,
      duration_ms: s.durationMs,
      screenshot_url: screenshotUrl,
      error_message: s.errorMessage ?? null,
    });
  }
  return payload.steps.length;
}
