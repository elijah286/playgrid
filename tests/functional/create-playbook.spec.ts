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

test("create playbook", async ({ page, recorder }) => {
  recorder.scenario = "create-playbook";
  const name = `${FUNCTEST_PREFIX} create ${Date.now()}`;

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("open the new-playbook flow", page, async () => {
    await page.goto("/home", { waitUntil: "networkidle" });
    // The create entry is a button containing "New Playbook" — the hero "book"
    // on an empty account ("Your New Playbook") or the dashed add-tile once
    // playbooks exist. A text-content filter matches both.
    await page.getByRole("button").filter({ hasText: /new playbook/i }).first().click();
    await expect(page.getByPlaceholder(/varsity/i)).toBeVisible({ timeout: 10_000 });
  });

  await recorder.step("name + create the playbook", page, async () => {
    await page.getByPlaceholder(/varsity/i).fill(name);
    await page.getByRole("button", { name: /^create$/i }).click();
    await page.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 20_000 });
  });

  await recorder.step("playbook page renders with its empty state", page, async () => {
    // The freshly-created playbook lands on its page showing the name + the
    // "Draw your first play" empty state. (Drawing a play itself goes through
    // the formation picker — a follow-up scenario.)
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /draw your first play|new play/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
