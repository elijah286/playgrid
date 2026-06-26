/**
 * PRINT / EXPORT PLAYSHEET — read-path, fast, good for perf baselining.
 *
 * Creates a throwaway playbook, then renders its printable playsheet
 * (`/playbooks/[id]/print`) and confirms it produced a page (not an error).
 * Self-contained so it doesn't depend on the test coach already having data.
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

test("print / export playsheet", async ({ page, recorder }) => {
  recorder.scenario = "print-playsheet";
  const name = `${FUNCTEST_PREFIX} print ${Date.now()}`;
  let playbookId = "";

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("create a playbook to print", page, async () => {
    await page.goto("/home", { waitUntil: "networkidle" });
    await page.getByRole("button").filter({ hasText: /new playbook/i }).first().click();
    await page.getByPlaceholder(/varsity/i).waitFor();
    await page.getByPlaceholder(/varsity/i).fill(name);
    await page.getByRole("button", { name: /^create$/i }).click();
    await page.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 25_000 });
    playbookId = page.url().match(/playbooks\/([0-9a-f-]+)/i)?.[1] ?? "";
    expect(playbookId).not.toBe("");
  });

  await recorder.step("render the printable playsheet", page, async () => {
    await page.goto(`/playbooks/${playbookId}/print`, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    // Not an error/crash page.
    await expect(page.getByText(/something went wrong|application error|500/i)).toHaveCount(0);
  });
});
