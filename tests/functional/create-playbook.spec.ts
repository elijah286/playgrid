/**
 * CREATE PLAYBOOK + PLAY — core authoring write-path.
 *
 * Sign in as the test coach, create a playbook, and add a play. Confirms the
 * primary create flow + editor load. Selectors inferred from home/ui.tsx +
 * EditorHeaderBar ("New Playbook", "New play") and may need a first-run pass.
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

test("create playbook + play", async ({ page, recorder }) => {
  recorder.scenario = "create-playbook";
  const name = `${FUNCTEST_PREFIX} create ${Date.now()}`;

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("open the new-playbook flow", page, async () => {
    await page.goto("/home", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /new playbook/i }).first().click();
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 10_000 });
  });

  await recorder.step("name + create the playbook", page, async () => {
    await page.getByRole("textbox").first().fill(name);
    await page
      .getByRole("button", { name: /create|continue|next|save|done|finish/i })
      .first()
      .click();
    await page.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 20_000 });
  });

  await recorder.step("add a play", page, async () => {
    await page.getByRole("button", { name: /new play|add play/i }).first().click();
    // Land in the editor (route or an editor surface appears).
    await expect(
      page.getByRole("button", { name: /save|new play/i }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
