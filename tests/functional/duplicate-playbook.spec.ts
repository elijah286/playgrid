/**
 * DUPLICATE A PLAYBOOK — copy an existing playbook into the coach's account.
 *
 * Creates a playbook, opens Team options → Duplicate, and confirms a second
 * playbook now exists for the coach. Covers the "duplicate" flow coaches use to
 * fork a starting point.
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

test("duplicate a playbook", async ({ page, recorder }) => {
  recorder.about({
    scenario: "duplicate-playbook",
    title: "Duplicate a playbook",
    description:
      "Creates a playbook, then duplicates it via Team options → Duplicate. Verifies a second copy appears in the coach's account — the flow used to fork a starting point.",
  });
  const baseName = `${FUNCTEST_PREFIX} dup ${Date.now()}`;
  const admin = serviceClient();
  let coachId = "";
  let ownedBefore = 0;

  // Count the coach's owned playbooks — naming-independent, so it works no matter
  // what the duplicate is named.
  async function countOwned(): Promise<number> {
    const { count } = await admin!
      .from("playbook_members")
      .select("playbook_id", { count: "exact", head: true })
      .eq("user_id", coachId)
      .eq("role", "owner");
    return count ?? 0;
  }

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("create a playbook", page, async () => {
    const id = await createPlaybook(page, baseName);
    expect(id).not.toBe("");
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY not set — cannot verify duplicate.");
    const { data: owner } = await admin!
      .from("playbook_members")
      .select("user_id")
      .eq("playbook_id", id)
      .eq("role", "owner")
      .maybeSingle();
    coachId = (owner?.user_id as string) ?? "";
    ownedBefore = await countOwned();
  });

  await recorder.step("duplicate it via Team options → Duplicate → Create copy", page, async () => {
    await page.getByRole("button", { name: /team options/i }).first().click();
    // "Duplicate" is a role=menuitem (not a plain button); it opens a small
    // duplicate form whose confirm button is "Create copy".
    await page.getByRole("menuitem", { name: /^duplicate$/i }).first().click();
    // Name the copy with the __functest prefix so the sweep reclaims it. The
    // suggested name is "{Coach}'s {Variant} Playbook" (un-prefixed), which the
    // cleanup never matched — so every run leaked an orphan copy into the
    // coach's account. The dialog's name field is autofocused.
    await page.locator("input:focus").fill(`${baseName} copy`);
    await page.getByRole("button", { name: /create copy/i }).first().click();
    await page.waitForTimeout(3000);
  });

  await recorder.step("confirm the coach now owns one more playbook", page, async () => {
    const ownedAfter = await countOwned();
    expect(ownedAfter, "duplicating should add exactly one owned playbook").toBe(
      ownedBefore + 1,
    );
  });
});
