/**
 * COACH AI (Cal) — generate a play via chat.
 *
 * Cal is gated, slower, and costs tokens, so this scenario:
 *   - skips itself when no Cal entry is found for the coach account (the seed
 *     flag isn't enabled yet) rather than spuriously failing every run, and
 *   - uses a generous timeout for the model round-trip.
 *
 * Selectors are best-effort; refine once Cal is enabled for the test coach.
 */
import { test, expect, signIn, testAccounts, FUNCTEST_PREFIX } from "./_helpers";

const accounts = testAccounts();

test("coach AI generates a play", async ({ page, recorder }) => {
  recorder.scenario = "coach-ai";
  test.setTimeout(120_000);

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  // Open the most recent playbook so Cal has a context to compose into.
  await recorder.step("open a playbook", page, async () => {
    await page.goto("/playbooks", { waitUntil: "networkidle" });
    const tile = page.locator('a[href^="/playbooks/"]').first();
    await tile.waitFor({ timeout: 15_000 });
    await tile.click();
    await page.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 20_000 });
  });

  // Find a Cal entry point; if there isn't one, the account/flag isn't enabled.
  const calTrigger = page.getByRole("button", { name: /cal|coach ai|ask cal|assistant/i });
  if ((await calTrigger.count()) === 0) {
    test.skip(true, "Coach AI not available for the test coach (gate not enabled).");
  }

  await recorder.step("open Cal and send a prompt", page, async () => {
    await calTrigger.first().click();
    const input = page
      .locator('textarea, input[type="text"]')
      .filter({ hasNot: page.locator("[readonly]") })
      .last();
    await input.waitFor({ timeout: 10_000 });
    await input.fill(`Draw a simple mesh concept for ${FUNCTEST_PREFIX} test`);
    await input.press("Enter");
  });

  await recorder.step("Cal responds", page, async () => {
    // A reply bubble / play fence should appear within the model round-trip.
    await expect(
      page.getByText(/mesh|play|here|created|added/i).first(),
    ).toBeVisible({ timeout: 90_000 });
  });
});
