/**
 * CUSTOMIZE PLAYBOOK COLORS — change a playbook's team color and confirm it sticks.
 *
 * Creates a playbook, opens the Customize dialog (?customize=1), picks a different
 * color swatch, saves, and verifies the playbook's stored color changed. Covers
 * the appearance-customization flow coaches use to brand their team.
 */
import {
  test,
  expect,
  signIn,
  createPlaybook,
  testAccounts,
  serviceClient,
  cleanupFunctestPlaybooks,
  FUNCTEST_PREFIX,
} from "./_helpers";

const accounts = testAccounts();
const NEW_COLOR = "#EF4444"; // a red swatch in the Customize dialog

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
});

test("customize playbook colors", async ({ page, recorder }) => {
  recorder.about({
    scenario: "customize-colors",
    title: "Customize a playbook's colors",
    description:
      "Opens a playbook's Customize dialog, picks a different team color, and saves. Verifies the appearance change persists — the branding flow coaches use for their team.",
  });
  let playbookId = "";

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("create a playbook", page, async () => {
    playbookId = await createPlaybook(page, `${FUNCTEST_PREFIX} colors ${Date.now()}`);
    expect(playbookId).not.toBe("");
  });

  await recorder.step("open Customize and pick a new color", page, async () => {
    await page.goto(`/playbooks/${playbookId}?customize=1`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: NEW_COLOR }).first().click();
  });

  await recorder.step("save and confirm the color persisted", page, async () => {
    await page.getByRole("button", { name: /^save$/i }).first().click();
    await page.waitForTimeout(1500);
    const admin = serviceClient();
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY not set — cannot verify color.");
    const { data: pb } = await admin!
      .from("playbooks")
      .select("color")
      .eq("id", playbookId)
      .maybeSingle();
    expect((pb?.color as string | null)?.toLowerCase()).toBe(NEW_COLOR.toLowerCase());
  });
});
