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

    const payload = {
      gitSha: process.env.GITHUB_SHA || process.env.GIT_SHA || null,
      trigger: process.env.FUNCTEST_TRIGGER || "manual",
      environment: process.env.BASE_URL || "",
      status: failed ? "failed" : "passed",
      startedAt: new Date(this.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - this.startedAtMs,
      meta: { browser: "chromium" },
      steps,
    };

    const ingestUrl = process.env.INGEST_URL;
    const secret = process.env.CRON_SECRET;
    if (!ingestUrl || !secret) {
      console.log(
        `[functest-reporter] ${payload.status} — ${steps.length} steps. INGEST_URL/CRON_SECRET not set, skipping ingest.`,
      );
      return;
    }

    try {
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text().catch(() => "");
      console.log(`[functest-reporter] ingest → ${res.status} ${text.slice(0, 200)}`);
    } catch (e) {
      console.error("[functest-reporter] ingest POST failed:", e);
    }
  }
}
