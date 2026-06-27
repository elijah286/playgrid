/**
 * INHERIT AN EXAMPLE — claim a public example playbook into the coach's account.
 *
 * Opens an example's claim page (/copy/example/<id>), clicks "Claim & customize",
 * and confirms a new playbook (a copy of the example, not the example itself)
 * lands in the coach's account. Covers the "start from an example" onboarding path.
 *
 * The claimed playbook keeps the example's name (not the __functest prefix), so
 * it's tracked by id and deleted in afterAll.
 */
import {
  test,
  expect,
  signIn,
  testAccounts,
  serviceClient,
  cleanupFunctestPlaybooks,
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
    await page.getByRole("button", { name: /claim/i }).first().click();
    await page.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 25_000 });
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
