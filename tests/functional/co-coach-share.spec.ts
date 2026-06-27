/**
 * SHARE A PLAYBOOK WITH A CO-COACH — create a coach (editor) invite link.
 *
 * Creates a playbook, opens Share → "Add a co-coach" → "Copy link", and confirms
 * an editor-role invite was created. (The player-role path is covered by
 * invite-accept; this covers the coach-collaboration share.)
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

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
});

test("share playbook with a co-coach", async ({ page, recorder }) => {
  recorder.about({
    scenario: "co-coach-share",
    title: "Share a playbook with a co-coach",
    description:
      "Creates a playbook and generates a co-coach (editor) invite link via Share → Add a co-coach → Copy link. Verifies the editor invite is created — the flow for letting another coach co-edit a playbook.",
  });
  let playbookId = "";

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("create a playbook", page, async () => {
    playbookId = await createPlaybook(page, `${FUNCTEST_PREFIX} cocoach ${Date.now()}`);
    expect(playbookId).not.toBe("");
  });

  await recorder.step("Share → Add a co-coach → Copy link", page, async () => {
    await page.goto(`/playbooks/${playbookId}?share=1`, { waitUntil: "networkidle" });
    await page.getByText("Add a co-coach", { exact: false }).first().click();
    await page.getByRole("button", { name: /copy link/i }).first().click();
    await page.waitForTimeout(1000);
  });

  await recorder.step("confirm an editor (coach) invite was created", page, async () => {
    const admin = serviceClient();
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY not set — cannot verify invite.");
    const { data: inv } = await admin!
      .from("playbook_invites")
      .select("role")
      .eq("playbook_id", playbookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(inv?.role, "co-coach share should create an editor invite").toBe("editor");
  });
});
