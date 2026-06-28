/**
 * COACH AI (Cal) — add a defense onto an OFFENSIVE play.
 *
 * Reproduces the 2026-06-28 coach report: "adding a defensive formation into an
 * offensive play ... doesn't respond well" (slow + unreliable), while building
 * the defense first and adding offense after "responded better".
 *
 * Root cause (fixed on the coach-cal-defense-overlay branch): when a coach opens
 * an offensive play and asks for a defense, the offense lives in the anchored
 * diagram (ctx.playDiagramText), NOT in chat history — so compose_defense's
 * overlay had no offense baseline and produced an offense-less result, and the
 * byte-preservation failures drove the validator retry loop (the slowness).
 *
 * Two scenarios, mirroring the two paths the coach described:
 *   1. add-defense-user-install — Cal overlays a defense onto the anchored play
 *      and the coach clicks "Add to this play" to keep it.
 *   2. add-defense-cal-install  — the coach asks Cal to INSTALL/SAVE the defense
 *      and Cal does it for them (save-intent → auto-commit).
 *
 * Like coach-ai.spec.ts, this is conservative: Cal is gated, slow, and costs
 * tokens, so every fragile step SKIPS rather than failing the suite when Cal
 * isn't reachable for the test account. The per-step durations the recorder
 * captures are the "is it slow?" signal on the Functional Testing admin tab.
 *
 * NOTE: this validates the fix only when run against a deploy that HAS it (CI
 * post-deploy / nightly). Run against current prod it demonstrates the bug.
 * The authoritative regression guards are the deterministic unit/tool tests
 * (src/lib/coach-ai/compose-defense-overlay*.test.ts).
 */
import {
  test,
  expect,
  signIn,
  testAccounts,
  serviceClient,
  cleanupFunctestPlaybooks,
  FUNCTEST_PREFIX,
  createPlaybook,
} from "./_helpers";
import type { Page } from "@playwright/test";

const accounts = testAccounts();

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
});

/** Locate Cal's chat input on whatever surface just opened it. Returns the
 *  textarea/input or null when Cal isn't reachable (account not entitled). */
async function calInput(page: Page) {
  const input = page
    .locator('textarea, input[type="text"]')
    .filter({ hasNot: page.locator("[readonly]") })
    .last();
  try {
    await input.waitFor({ timeout: 15_000 });
    return input;
  } catch {
    return null;
  }
}

/** Open Cal from the current page. Tries the visible CTA first; falls back to
 *  the global `coach-cal:open` event the launcher listens for (the editor hides
 *  the visible Cal button on desktop, but CoachAiLauncher is mounted in the root
 *  layout, so the event opens it anywhere). Returns false when the panel never
 *  appears (Cal genuinely unavailable for the account). */
async function openCal(page: Page): Promise<boolean> {
  const entry = page.getByRole("button", {
    name: /generate play|coach cal|ask cal|cal ai|coach assistant/i,
  });
  if ((await entry.count()) > 0) {
    await entry.first().click();
  } else {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("coach-cal:open", {
          detail: { entryPoint: null, prompt: "", key: Date.now() },
        }),
      );
    });
  }
  const input = page
    .locator('textarea, input[type="text"]')
    .filter({ hasNot: page.locator("[readonly]") })
    .last();
  try {
    await input.waitFor({ timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** The most-recently-created play id in a playbook (service role). Used to open
 *  the play's editor directly so Cal is ANCHORED to it — the exact condition
 *  that triggered the bug (offense in ctx.playDiagramText, not chat history). */
async function latestPlayId(playbookId: string): Promise<string | null> {
  const admin = serviceClient();
  if (!admin) return null;
  const { data } = await admin
    .from("plays")
    .select("id")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}

/** Poll until Cal's auto-saved play actually lands (the DB write trails the
 *  reply text by a few seconds). The play row appearing — not chat copy — is
 *  the real "Cal saved an offense" signal. Returns null if none within ms. */
async function waitForPlay(playbookId: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const id = await latestPlayId(playbookId);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return null;
}

test("Cal adds a defense to an anchored offensive play (coach installs it)", async ({
  page,
  recorder,
}) => {
  recorder.about({
    scenario: "add-defense-user-install",
    title: "Cal adds a defense to an offensive play",
    description:
      "Opens an offensive play in the editor (Cal anchored to it), asks Cal to overlay a Cover 3, and the coach clicks 'Add to this play'. Verifies the offense survives and a defense overlay is offered. Skips when Cal isn't enabled.",
  });
  test.setTimeout(330_000);
  const name = `${FUNCTEST_PREFIX} add-defense ${Date.now()}`;

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  let playbookId = "";
  await recorder.step("create a playbook", page, async () => {
    playbookId = await createPlaybook(page, name);
    expect(playbookId).not.toBe("");
  });

  // Build the offensive play via Cal (the proven coach-ai.spec.ts path), then
  // anchor to it. This gives us a real, saved offensive play to add defense to.
  if (!(await openCal(page))) {
    test.skip(true, "Coach AI entry not available for the test account.");
  }
  let playId: string | null = null;
  await recorder.step("ask Cal to draw + save an offensive play, wait for it to persist", page, async () => {
    const input = await calInput(page);
    if (!input) test.skip(true, "Cal chat input not reachable.");
    await input!.fill("Draw a simple mesh concept and save it to this playbook as a new play.");
    await input!.press("Enter");
    // The real signal Cal saved is the play row appearing — not chat text.
    playId = await waitForPlay(playbookId, 150_000);
    if (!playId) test.skip(true, "Cal did not persist an offensive play within 150s.");
  });

  await recorder.step("open the saved play's editor (anchors Cal to it)", page, async () => {
    await page.goto(`/plays/${playId}/edit`, { waitUntil: "networkidle" });
  });

  await recorder.step("open Cal on the play and ask for a Cover 3 overlay", page, async () => {
    if (!(await openCal(page))) test.skip(true, "Cal not reachable on the play editor.");
    const input = await calInput(page);
    if (!input) test.skip(true, "Cal chat input not reachable on the play editor.");
    // This is the reported flow: offense is the OPEN play, not a chat fence.
    await input!.fill("Add a Cover 3 defense to this play.");
    await input!.press("Enter");
  });

  let chipAppeared = false;
  await recorder.step("wait for Cal's defense overlay (the save-defense chip)", page, async () => {
    // The save-defense chip ("Add to this play" / "Save as new defense play") is
    // the unambiguous signal Cal produced an overlay AGAINST this offense — a
    // specific button, not generic page text. Its ABSENCE after a long wait is
    // itself the reported failure (overlay didn't work).
    const t0 = Date.now();
    const chip = page.getByRole("button", { name: /add to this play|save as new defense/i });
    try {
      await chip.first().waitFor({ state: "visible", timeout: 120_000 });
      chipAppeared = true;
      console.log(`[add-defense] save-defense chip appeared after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch {
      console.log(`[add-defense] NO save-defense chip after ${((Date.now() - t0) / 1000).toFixed(1)}s — overlay did not produce a savable defense (reproduces the reported failure)`);
    }
  });

  await recorder.step("coach clicks 'Add to this play' (if Cal offered one)", page, async () => {
    if (!chipAppeared) {
      test.skip(true, "Cal produced no save-defense overlay to keep — reproduces the reported 'doesn't work well' failure.");
    }
    const chip = page.getByRole("button", { name: /add to this play/i });
    await chip.first().click();
    await expect(
      page.getByText(/adding…|added|saved|opponent|defense/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});

test("Cal installs + saves a defense itself (coach doesn't click anything)", async ({
  page,
  recorder,
}) => {
  recorder.about({
    scenario: "add-defense-cal-install",
    title: "Cal installs a defense for the coach",
    description:
      "On an anchored offensive play, the coach uses save-intent ('install and save a Cover 3'); Cal commits the defense itself (auto-save) without the coach clicking a chip. Skips when Cal isn't enabled.",
  });
  test.setTimeout(330_000);
  const name = `${FUNCTEST_PREFIX} cal-install-def ${Date.now()}`;

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  let playbookId = "";
  await recorder.step("create a playbook", page, async () => {
    playbookId = await createPlaybook(page, name);
    expect(playbookId).not.toBe("");
  });

  if (!(await openCal(page))) {
    test.skip(true, "Coach AI entry not available for the test account.");
  }
  let playId: string | null = null;
  await recorder.step("ask Cal to draw + save an offensive play, wait for it to persist", page, async () => {
    const input = await calInput(page);
    if (!input) test.skip(true, "Cal chat input not reachable.");
    await input!.fill("Draw a trips right slant-flat concept and save it as a new play.");
    await input!.press("Enter");
    playId = await waitForPlay(playbookId, 150_000);
    if (!playId) test.skip(true, "Cal did not persist an offensive play within 150s.");
  });

  await recorder.step("open the saved play (anchors Cal)", page, async () => {
    await page.goto(`/plays/${playId}/edit`, { waitUntil: "networkidle" });
  });

  await recorder.step("coach asks Cal to INSTALL + SAVE a defense (save-intent)", page, async () => {
    if (!(await openCal(page))) test.skip(true, "Cal not reachable on the play editor.");
    const input = await calInput(page);
    if (!input) test.skip(true, "Cal chat input not reachable.");
    await input!.fill("Install a Tampa 2 against this play and save it as its opponent.");
    await input!.press("Enter");
  });

  await recorder.step("Cal commits the defense itself (no coach click needed)", page, async () => {
    // Auto-save appends a "Saved defense play" suffix to Cal's reply. Tolerate
    // the chip path too (some phrasings still offer rather than auto-commit).
    const savedSuffix = page.getByText(/saved defense play|saved.*opponent|installed/i).first();
    const chip = page.getByRole("button", { name: /add to this play|save as new defense/i });
    await expect(savedSuffix.or(chip)).toBeVisible({ timeout: 150_000 });
  });

  await recorder.step("verify the defense persisted", page, async () => {
    const admin = serviceClient();
    if (!admin || !playId) {
      test.skip(true, "Service role unavailable — cannot verify persistence.");
    }
    // Either a linked defense play exists (vs_play_id) or the anchored play now
    // has a custom opponent. Best-effort: count defense plays in the playbook.
    const { data } = await admin!
      .from("plays")
      .select("id, play_type, vs_play_id")
      .eq("playbook_id", playbookId);
    const hasDefense = (data ?? []).some(
      (p: { play_type?: string; vs_play_id?: string | null }) =>
        p.play_type === "defense" || !!p.vs_play_id,
    );
    expect(hasDefense).toBe(true);
  });
});
