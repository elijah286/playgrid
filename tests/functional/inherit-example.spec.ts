/**
 * INHERIT AN EXAMPLE — claim a public example playbook into the coach's account.
 *
 * Opens an example's claim page (/copy/example/<id>), clicks "Claim & customize",
 * and confirms a new playbook (a copy of the example, not the example itself)
 * lands in the coach's account. Covers the "start from an example" onboarding path.
 *
 * The claim form lets the coach rename the copy, so we name it with the
 * __functest prefix. That makes the copy reclaimable two ways: the afterAll
 * deletes it by id, and `cleanupFunctestPlaybooks()` / the scheduled sweep
 * catch it by name even if the run times out before `claimedId` is captured
 * (the claim succeeds server-side well before the client navigates, so a tight
 * timeout used to leak an un-prefixed orphan into the coach's account).
 */
import {
  test,
  expect,
  signIn,
  testAccounts,
  serviceClient,
  cleanupFunctestPlaybooks,
  FUNCTEST_PREFIX,
} from "./_helpers";

const accounts = testAccounts();
let claimedId = "";

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
  if (claimedId) {
    const admin = serviceClient();
    if (admin) await admin.from("playbooks").delete().eq("id", claimedId);
  }
});

test("inherit an example playbook", async ({ page, recorder }) => {
  recorder.about({
    scenario: "inherit-example",
    title: "Inherit (claim) an example playbook",
    description:
      "Opens a public example's claim page and clicks 'Claim & customize', confirming a copy of the example lands in the coach's account as a new playbook. Covers the 'start from an example' onboarding path.",
  });

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  let exampleId = "";
  await recorder.step("pick an example", page, async () => {
    await page.goto("/examples", { waitUntil: "networkidle" });
    const tile = page.locator('a[href^="/playbooks/"]').first();
    await tile.waitFor({ timeout: 15_000 });
    const href = (await tile.getAttribute("href")) || "";
    exampleId = href.match(/playbooks\/([0-9a-f-]+)/i)?.[1] ?? "";
    expect(exampleId).not.toBe("");
  });

  await recorder.step("claim it into the account", page, async () => {
    await page.goto(`/copy/example/${exampleId}`, { waitUntil: "networkidle" });
    // Rename the copy to a __functest-prefixed name so the sweep reclaims it
    // even if this step times out before claimedId is captured. The name field
    // is the only maxlength=120 input on the page (PreviewCard + LogoPicker
    // aside).
    const claimName = `${FUNCTEST_PREFIX} claim ${Date.now()}`;
    const nameInput = page.locator('input[maxlength="120"]');
    await nameInput.waitFor({ timeout: 15_000 });
    await nameInput.fill(claimName);
    await page.getByRole("button", { name: /claim/i }).first().click();
    // The claim runs a server action that deep-copies the example (plays,
    // versions, formations) before the client navigates. On a cold prod
    // instance that can run well past 25s even though it succeeds — give it
    // room well inside the 90s per-test budget.
    await page.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 60_000 });
    claimedId = page.url().match(/playbooks\/([0-9a-f-]+)/i)?.[1] ?? "";
    // It must be a NEW playbook, not the example we opened.
    expect(claimedId).not.toBe("");
    expect(claimedId).not.toBe(exampleId);
  });

  await recorder.step("confirm the claimed playbook exists", page, async () => {
    const admin = serviceClient();
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY not set — cannot verify claim.");
    const { data: pb } = await admin!
      .from("playbooks")
      .select("id")
      .eq("id", claimedId)
      .maybeSingle();
    expect(pb?.id, "claimed example should be a real playbook in the account").toBe(claimedId);
  });
});
