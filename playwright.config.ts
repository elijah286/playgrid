import { defineConfig, devices } from "@playwright/test";

/**
 * Functional-testing harness config. Drives the PRODUCTION app (or any BASE_URL)
 * headlessly and ingests results via the custom reporter (tests/functional/
 * _reporter.ts → /api/functional-tests/ingest).
 *
 * Run: BASE_URL=https://xogridmaker.com INGEST_URL=…/api/functional-tests/ingest \
 *      CRON_SECRET=… FUNC_TEST_COACH_* FUNC_TEST_PLAYER_* npx playwright test
 *
 * Kept SEPARATE from the unit suite (`vitest run` / *.test.ts under src/): this
 * config only picks up tests/functional/*.spec.ts.
 *
 * Suites (FUNCTEST_SUITE):
 *   - unset / "core": every spec EXCEPT the Coach Cal ones. This is what runs
 *     post-deploy and nightly.
 *   - "cal": ONLY the Coach Cal specs. Each Cal scenario drives the live LLM on
 *     production, so it spends real tokens — these are excluded from the
 *     scheduled/post-deploy runs and only fire on demand (the Site Admin
 *     "Run Coach Cal tests" button, which dispatches this workflow with
 *     suite=cal, or a manual `FUNCTEST_SUITE=cal npx playwright test`).
 */
const CAL_SPECS = [
  "**/coach-ai.spec.ts",
  "**/coach-ai-add-defense.spec.ts",
];
const SUITE = process.env.FUNCTEST_SUITE === "cal" ? "cal" : "core";

export default defineConfig({
  testDir: "./tests/functional",
  testMatch: SUITE === "cal" ? CAL_SPECS : "**/*.spec.ts",
  // Core runs never touch the token-spending Cal specs; the cal suite runs only
  // them.
  testIgnore: SUITE === "cal" ? [] : CAL_SPECS,
  // Write-path scenarios share the seeded accounts and create/clean entities, so
  // run serially to keep ordering + teardown deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["./tests/functional/_reporter.ts"], ["list"]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: true,
    screenshot: "off", // the Recorder captures shots at meaningful steps itself
    // Record a video of each scenario; the reporter turns it into a small
    // frame-diff-optimized GIF replay. Recorded a touch below viewport to keep
    // the source light (the reporter downscales further).
    video: { mode: "on", size: { width: 1000, height: 563 } },
    trace: process.env.CI ? "retain-on-failure" : "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
