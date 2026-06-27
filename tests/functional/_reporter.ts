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

type TestRecord = { scenario: string; steps: StepRecord[]; videoPaths: string[] };

export default class FunctestReporter implements Reporter {
  private steps: StepRecord[] = [];
  private tests: TestRecord[] = [];
  private scenarios: Record<string, { title: string; description: string }> = {};
  private startedAtMs = Date.now();
  private sawFailure = false;

  onBegin(): void {
    this.startedAtMs = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== "passed") this.sawFailure = true;
    const att = result.attachments.find((a) => a.name === "functest-steps");
    let parsed: StepRecord[] = [];
    if (att) {
      try {
        const raw = att.body
          ? att.body.toString("utf8")
          : att.path
            ? readFileSync(att.path, "utf8")
            : null;
        if (raw) {
          const j = JSON.parse(raw) as StepRecord[];
          if (Array.isArray(j)) parsed = j;
        }
      } catch {
        /* a malformed attachment shouldn't sink the whole report */
      }
    }
    this.steps.push(...parsed);
    // Video clips for this scenario: the config records page-fixture contexts;
    // multi-context specs (invite-accept) attach their own clips. Both land as
    // 'video' attachments — stitched in order in the replay.
    const videoPaths = result.attachments
      .filter((a) => a.name === "video" && a.path)
      .map((a) => a.path as string);
    const scenario = parsed[0]?.scenario || test.title;
    if (parsed.length || videoPaths.length) {
      this.tests.push({ scenario, steps: parsed, videoPaths });
    }

    // Scenario title/description (what the test is for) for the admin page.
    const metaAtt = result.attachments.find((a) => a.name === "functest-meta");
    if (metaAtt) {
      try {
        const raw = metaAtt.body
          ? metaAtt.body.toString("utf8")
          : metaAtt.path
            ? readFileSync(metaAtt.path, "utf8")
            : null;
        if (raw) {
          const m = JSON.parse(raw) as { scenario?: string; title?: string; description?: string };
          if (m.scenario && (m.title || m.description)) {
            this.scenarios[m.scenario] = { title: m.title ?? "", description: m.description ?? "" };
          }
        }
      } catch {
        /* malformed meta shouldn't sink the report */
      }
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const finishedAtMs = Date.now();
    // Re-number ordinals across the whole run so the admin gallery is sequential.
    const steps = this.steps.map((s, i) => ({ ...s, ordinal: i + 1 }));
    const failed =
      this.sawFailure || result.status !== "passed" || steps.some((s) => s.status === "failed");

    const meta: Record<string, unknown> = { browser: "chromium" };
    if (Object.keys(this.scenarios).length) meta.scenarios = this.scenarios;

    // One animated GIF per scenario — a frame-diff-optimized replay from the
    // recorded video (falling back to a step-screenshot slideshow). Uploaded via
    // service-role (available locally + in CI); the URLs ride in meta.gifs, which
    // both ingest paths persist. Skipped without a service-role key.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const prefix = `${this.startedAtMs}-${(process.env.GITHUB_SHA || process.env.GIT_SHA || "local").slice(0, 7)}`;
      try {
        const gifs = await buildReplays(this.tests, prefix);
        if (Object.keys(gifs).length) meta.gifs = gifs;
      } catch (e) {
        console.error("[functest-reporter] replay assembly failed:", e);
      }
    }

    // Persist per-step PNG stills only for FAILED steps — the replay GIF is the
    // pass-case summary, so passing steps don't need a stored still (a big
    // storage saving for nightly). The GIFs were already built from the full
    // frames (this.tests) above, so dropping these doesn't affect the replays.
    const persistedSteps = steps.map((s) =>
      s.status === "failed" ? s : { ...s, screenshotBase64: undefined },
    );

    const payload = {
      gitSha: process.env.GITHUB_SHA || process.env.GIT_SHA || null,
      trigger: process.env.FUNCTEST_TRIGGER || "manual",
      environment: process.env.BASE_URL || "",
      status: failed ? "failed" : "passed",
      startedAt: new Date(this.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - this.startedAtMs,
      meta,
      steps: persistedSteps,
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
 * Build one replay GIF per scenario and upload it. Prefers a frame-diff-optimized
 * GIF from the recorded video (smooth); falls back to a step-screenshot slideshow
 * when no video is available. Returns { scenario: publicUrl }.
 */
async function buildReplays(
  tests: TestRecord[],
  prefix: string,
): Promise<Record<string, string>> {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const out: Record<string, string> = {};
  for (const t of tests) {
    if (!t.scenario) continue;
    let gif: Buffer | null = null;
    if (t.videoPaths.length) {
      gif = await videoToOptimizedGif(t.videoPaths).catch((e) => {
        console.error(`[functest-reporter] video replay(${t.scenario}) failed:`, e?.message ?? e);
        return null;
      });
    }
    if (!gif) {
      gif = await slideshowGif(t.steps).catch(() => null);
    }
    if (!gif) continue;
    const key = `gifs/${prefix}-${slug(t.scenario)}.gif`;
    const { error } = await admin.storage
      .from("test-screenshots")
      .upload(key, gif, { contentType: "image/gif", upsert: true });
    if (!error) {
      out[t.scenario] = admin.storage.from("test-screenshots").getPublicUrl(key).data.publicUrl;
    }
  }
  return out;
}

/** Slideshow fallback: a GIF flipping through the step screenshots (~1.5s each). */
async function slideshowGif(steps: StepRecord[]): Promise<Buffer | null> {
  const withShots = steps.filter((s) => s.screenshotBase64);
  if (withShots.length === 0) return null;
  const sharp = (await import("sharp")).default;
  const frames = await Promise.all(
    withShots.map((s) =>
      sharp(Buffer.from(s.screenshotBase64!, "base64")).resize({ width: 600 }).png().toBuffer(),
    ),
  );
  return sharp(frames, { join: { animated: true } })
    .gif({ delay: withShots.map(() => 1500), loop: 0 })
    .toBuffer();
}

/**
 * Convert recorded webm clip(s) into a small, smooth GIF: concat multiple clips,
 * downscale + reduce to 10fps with a 256-colour palette (ffmpeg), then frame-diff
 * optimize (gifsicle, optional — degrades to the ffmpeg output if unavailable).
 */
async function videoToOptimizedGif(videoPaths: string[]): Promise<Buffer | null> {
  if (videoPaths.length === 0) return null;
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const ffmpegMod = (await import("ffmpeg-static")) as unknown as { default?: string };
  const ffmpeg = ffmpegMod.default ?? (ffmpegMod as unknown as string);
  if (!ffmpeg) return null;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "functest-gif-"));
  try {
    // 1. Stitch multiple clips (coach → player) into one.
    let input = videoPaths[0]!;
    if (videoPaths.length > 1) {
      const list = path.join(tmp, "list.txt");
      fs.writeFileSync(
        list,
        videoPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
      );
      const combined = path.join(tmp, "combined.webm");
      execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", combined], { stdio: "ignore" });
      input = combined;
    }
    // 2. Video → palette-optimized GIF. diff_mode=rectangle stores only changed
    //    regions; flat UI palettes cleanly with no dither (crisp text).
    const rawGif = path.join(tmp, "raw.gif");
    execFileSync(
      ffmpeg,
      [
        "-y", "-i", input,
        "-vf",
        // Kept deliberately small for nightly storage: 8fps, 600px wide, 128-colour
        // palette, no dither (crisp UI text), rectangle diff (store only changes).
        "fps=8,scale=600:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=full[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle",
        "-loop", "0", rawGif,
      ],
      { stdio: "ignore" },
    );
    // 3. Frame-diff optimize (the screen2gif trick). Optional.
    let finalGif = rawGif;
    try {
      const gifsicleMod = (await import("gifsicle")) as unknown as { default?: string };
      const gifsicle = gifsicleMod.default ?? (gifsicleMod as unknown as string);
      if (gifsicle) {
        const optGif = path.join(tmp, "opt.gif");
        execFileSync(gifsicle, ["-O3", "--lossy=90", rawGif, "-o", optGif], { stdio: "ignore" });
        if (fs.existsSync(optGif)) finalGif = optGif;
      }
    } catch {
      /* gifsicle is optional — keep the ffmpeg GIF */
    }
    return fs.readFileSync(finalGif);
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* temp cleanup best-effort */
    }
  }
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
