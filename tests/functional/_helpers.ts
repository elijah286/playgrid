/**
 * Shared fixtures + helpers for the functional-testing harness.
 *
 * The harness drives the PRODUCTION app as a real user (Playwright Chromium,
 * headless) and records each meaningful workflow step as `{ status, durationMs,
 * screenshotBase64 }`. The custom reporter (./_reporter.ts) collects those step
 * records (attached as JSON per test) and POSTs one run to the app's ingest
 * endpoint, which stores them for the Site Admin "Functional Testing" tab.
 *
 * `signIn` is lifted from scripts/capture-marketing-screenshots.mjs (same login
 * form: email → Enter → password → Enter → wait for /home).
 */
import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export { expect };

/** Prefix every test-created entity so teardown / the nightly sweep can find them. */
export const FUNCTEST_PREFIX = "__functest";

export type StepRecord = {
  scenario: string;
  stepName: string;
  ordinal: number;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  errorMessage?: string;
  screenshotBase64?: string;
};

/** Per-test recorder: each `step()` times the work, screenshots the page, and
 *  appends a StepRecord. A failed step is recorded then re-thrown so the test
 *  (and the run) fails. The fixture below attaches `steps` as JSON on teardown. */
export class Recorder {
  steps: StepRecord[] = [];
  scenario = "unknown";
  /** Human-readable name shown on the Site Admin Functional Testing page. */
  title = "";
  /** What this test is for + what it verifies — shown on the admin page so a
   *  reviewer can tell at a glance which scenario does what. */
  description = "";

  /** Set the scenario key + the human title/description in one call (top of each
   *  spec). The title/description surface on the Site Admin dashboard. */
  about(opts: { scenario: string; title: string; description: string }): void {
    this.scenario = opts.scenario;
    this.title = opts.title;
    this.description = opts.description;
  }

  async step(name: string, page: Page, fn: () => Promise<void>): Promise<void> {
    const ordinal = this.steps.length + 1;
    const start = Date.now();
    let status: StepRecord["status"] = "passed";
    let errorMessage: string | undefined;
    try {
      await base.step(`${this.scenario}: ${name}`, fn);
    } catch (e) {
      status = "failed";
      errorMessage = e instanceof Error ? e.message : String(e);
    }
    const durationMs = Date.now() - start;
    let screenshotBase64: string | undefined;
    try {
      const buf = await page.screenshot({ fullPage: false });
      screenshotBase64 = buf.toString("base64");
    } catch {
      /* screenshot is best-effort; timing + status still recorded */
    }
    this.steps.push({
      scenario: this.scenario,
      stepName: name,
      ordinal,
      status,
      durationMs,
      errorMessage,
      screenshotBase64,
    });
    if (status === "failed") throw new Error(errorMessage ?? "step failed");
  }
}

export const test = base.extend<{ recorder: Recorder }>({
  // The 2nd fixture arg is Playwright's "use" callback; named `provide` here so
  // the react-hooks lint rule doesn't mistake `use(...)` for React's use() hook.
  recorder: async ({}, provide, testInfo) => {
    const rec = new Recorder();
    await provide(rec);
    // Teardown runs even when the test failed, so the failed step is included.
    await testInfo.attach("functest-steps", {
      body: Buffer.from(JSON.stringify(rec.steps)),
      contentType: "application/json",
    });
    // Scenario title/description for the admin page (what this test is for).
    await testInfo.attach("functest-meta", {
      body: Buffer.from(
        JSON.stringify({
          scenario: rec.scenario,
          title: rec.title,
          description: rec.description,
        }),
      ),
      contentType: "application/json",
    });
  },
});

/** Sign in via the real login form. Mirrors the marketing-capture script. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="email"]').press("Enter");
  await page.locator('input[type="password"]').waitFor({ timeout: 10_000 });
  await page.locator('input[type="password"]').fill(password);
  await page.locator('input[type="password"]').press("Enter");
  await page.waitForURL((u) => u.pathname === "/home" || u.pathname === "/", {
    timeout: 25_000, // prod sign-in can be slow under load; 15s was occasionally tight
  });
  // Brand-new accounts hit the "Agree to our terms to continue" gate on first
  // login (TermsAcceptancePrompt). Accept it the way a real new user does: tick
  // the agreement checkbox (the button is disabled until then), then continue.
  // It's recorded server-side, so subsequent logins skip the gate.
  const agree = page.getByRole("button", { name: /agree (&|and) continue/i });
  if (await agree.count()) {
    await page.getByRole("checkbox").first().check();
    await agree.first().click();
    // The component does a full window.location.reload() on success.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
  }
}

/** Credentials from env, with the same defaults as scripts/seed-functional-test.mjs. */
export function testAccounts() {
  return {
    coach: {
      email: process.env.FUNC_TEST_COACH_EMAIL || "functest-coach@xogridmaker.com",
      password: process.env.FUNC_TEST_COACH_PASSWORD || "",
    },
    player: {
      email: process.env.FUNC_TEST_PLAYER_EMAIL || "functest-player@xogridmaker.com",
      password: process.env.FUNC_TEST_PLAYER_PASSWORD || "",
    },
  };
}

/** Service-role Supabase client for setup/teardown that shouldn't depend on
 *  fragile UI selectors (creating the invite, asserting membership, cleanup).
 *  Returns null when the key isn't provided so specs can skip gracefully. */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Delete every test-created playbook whose name carries the functest prefix.
 *  Cascades memberships/invites. Best-effort; used in afterAll teardown. */
export async function cleanupFunctestPlaybooks(): Promise<void> {
  const admin = serviceClient();
  if (!admin) return;
  await admin.from("playbooks").delete().like("name", `${FUNCTEST_PREFIX}%`);
}
