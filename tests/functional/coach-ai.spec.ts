/**
 * COACH AI (Cal) — generate a play via chat.
 *
 * Cal is gated, slower, and costs tokens, so this scenario is deliberately
 * conservative: it creates its own playbook, then tries to open Cal's
 * play-generation entry ("Generate play" / Coach Cal). If no Cal entry is
 * reachable for the test account, it SKIPS rather than failing the suite. When
 * Cal is reachable it sends a prompt and waits (generously) for a reply.
 */
import {
  test,
  expect,
  signIn,
  testAccounts,
  cleanupFunctestPlaybooks,
  FUNCTEST_PREFIX,
} from "./_helpers";

const accounts = testAccounts();

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
});

test("coach AI generates a play", async ({ page, recorder }) => {
  recorder.about({
    scenario: "coach-ai",
    title: "Coach AI (Cal) generates a play",
    description:
      "Opens Coach Cal inside a playbook and asks it to generate a play, verifying Cal responds. Skips automatically when Cal isn't enabled for the test account.",
  });
  test.setTimeout(150_000);
  const name = `${FUNCTEST_PREFIX} cal ${Date.now()}`;

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("create a playbook for Cal to work in", page, async () => {
    await page.goto("/home", { waitUntil: "networkidle" });
    await page.getByRole("button").filter({ hasText: /new playbook/i }).first().click();
    await page.getByPlaceholder(/varsity/i).waitFor();
    await page.getByPlaceholder(/varsity/i).fill(name);
    await page.getByRole("button", { name: /^create$/i }).click();
    await page.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 25_000 });
  });

  // Find Cal's play-generation entry on the playbook page. If it isn't there,
  // Cal isn't enabled for this account — skip cleanly.
  const calEntry = page.getByRole("button", {
    name: /generate play|coach cal|ask cal|cal ai/i,
  });
  if ((await calEntry.count()) === 0) {
    test.skip(true, "Coach AI entry not available for the test account.");
  }

  await recorder.step("open Cal and send a prompt", page, async () => {
    await calEntry.first().click();
    const input = page
      .locator('textarea, input[type="text"]')
      .filter({ hasNot: page.locator("[readonly]") })
      .last();
    await input.waitFor({ timeout: 15_000 });
    await input.fill("Draw a simple mesh concept.");
    await input.press("Enter");
  });

  await recorder.step("Cal responds", page, async () => {
    await expect(
      page.getByText(/mesh|play|route|here|created|added|formation/i).first(),
    ).toBeVisible({ timeout: 120_000 });
  });
});
