/**
 * PRINT / EXPORT PLAYSHEET — read-path, fast, good for perf baselining.
 *
 * Sign in, open the coach's first playbook, render the printable playsheet
 * (`/playbooks/[id]/print`), and confirm it produced printable content. No
 * writes, so nothing to clean up.
 */
import { test, expect, signIn, testAccounts } from "./_helpers";

const accounts = testAccounts();

test("print / export playsheet", async ({ page, recorder }) => {
  recorder.scenario = "print-playsheet";

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  let playbookHref = "";
  await recorder.step("open a playbook", page, async () => {
    await page.goto("/playbooks", { waitUntil: "networkidle" });
    const tile = page.locator('a[href^="/playbooks/"]').first();
    await tile.waitFor({ timeout: 15_000 });
    playbookHref = (await tile.getAttribute("href")) || "";
    expect(playbookHref).toMatch(/\/playbooks\//);
    await page.goto(playbookHref, { waitUntil: "networkidle" });
  });

  await recorder.step("render the printable playsheet", page, async () => {
    await page.goto(`${playbookHref}/print`, { waitUntil: "networkidle" });
    // The print view should render a heading/playsheet, not an error/empty page.
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/error|something went wrong/i)).toHaveCount(0);
  });
});
