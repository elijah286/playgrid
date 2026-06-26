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
 */
export default defineConfig({
  testDir: "./tests/functional",
  testMatch: "**/*.spec.ts",
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
    trace: process.env.CI ? "retain-on-failure" : "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
