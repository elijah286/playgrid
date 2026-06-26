/**
 * INVITE → ACCEPT — the regression that started all of this.
 *
 * A coach (Team Coach) creates a playbook and a player invite link via the real
 * Share → "Add a player" → "Copy link" flow; the player opens the link and
 * accepts. The load-bearing assertion: accepting does NOT surface the "Could not
 * accept invite…" toast (the 42P10 the broken accept_invite RPC produced) and
 * DOES reach a success state. Had this existed, it would have caught the bug
 * before a customer canceled.
 *
 * The invite URL itself is resolved via service-role (the same token the coach's
 * "Copy link" put on the clipboard) — test plumbing to obtain what the coach
 * would paste. Every actual user action (create playbook, create the invite,
 * accept it) goes through the real UI.
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

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
});

test("invite → accept", async ({ browser, recorder }) => {
  recorder.scenario = "invite-accept";
  const playbookName = `${FUNCTEST_PREFIX} invite ${Date.now()}`;
  let playbookId = "";
  // Record both sessions — manual contexts aren't covered by the config's
  // `video` setting, so the reporter stitches these two clips into one replay.
  const videoDir = test.info().outputDir;
  const videoSize = { width: 1000, height: 563 };

  // ── Coach: create a throwaway playbook + a player invite link ──────────────
  const coachCtx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    recordVideo: { dir: videoDir, size: videoSize },
  });
  const coach = await coachCtx.newPage();
  const coachVideo = coach.video();
  try {
    await recorder.step("coach signs in", coach, async () => {
      await signIn(coach, accounts.coach.email, accounts.coach.password);
    });

    await recorder.step("coach creates a playbook", coach, async () => {
      await coach.goto("/home", { waitUntil: "networkidle" });
      await coach.getByRole("button").filter({ hasText: /new playbook/i }).first().click();
      await coach.getByPlaceholder(/varsity/i).waitFor();
      await coach.getByPlaceholder(/varsity/i).fill(playbookName);
      await coach.getByRole("button", { name: /^create$/i }).click();
      await coach.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 25_000 });
      playbookId = coach.url().match(/playbooks\/([0-9a-f-]+)/i)?.[1] ?? "";
      expect(playbookId).not.toBe("");
    });

    await recorder.step("coach creates a player invite link", coach, async () => {
      await coach.goto(`/playbooks/${playbookId}?share=1`, { waitUntil: "networkidle" });
      await coach.getByText("Add a player", { exact: false }).first().click();
      await coach.getByRole("button", { name: /copy link/i }).first().click();
    });
  } finally {
    await coachCtx.close();
  }

  // Resolve the invite link the coach just generated (the token "Copy link" put
  // on the clipboard). Service-role read only; the player accepts via the UI.
  const admin = serviceClient();
  test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY not set — cannot resolve invite token.");
  const { data: inv } = await admin!
    .from("playbook_invites")
    .select("token")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(inv?.token, "coach's Share → Add a player should have created an invite").toBeTruthy();
  const inviteUrl = `/invite/${inv!.token}`;

  // ── Player: accept the invite via the real accept page ─────────────────────
  const playerCtx = await browser.newContext({
    recordVideo: { dir: videoDir, size: videoSize },
  });
  const player = await playerCtx.newPage();
  const playerVideo = player.video();
  try {
    await recorder.step("player signs in", player, async () => {
      await signIn(player, accounts.player.email, accounts.player.password);
    });

    await recorder.step("player opens the invite link", player, async () => {
      await player.goto(inviteUrl, { waitUntil: "networkidle" });
      await expect(
        player.getByRole("button", { name: /accept invite/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await recorder.step("player accepts — no 42P10, reaches success", player, async () => {
      await player.getByRole("button", { name: /accept invite/i }).click();
      // The exact regression: accepting raised a toast. Assert it does NOT.
      await expect(player.getByText(/could not accept invite/i)).toHaveCount(0, {
        timeout: 15_000,
      });
      await expect(
        player
          .getByText(/you.?re in|request sent|go to the playbook|go to home/i)
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  } finally {
    await playerCtx.close();
  }

  // Attach both clips (coach, then player) so the reporter stitches one replay.
  for (const v of [coachVideo, playerVideo]) {
    if (!v) continue;
    try {
      await test.info().attach("video", { path: await v.path(), contentType: "video/webm" });
    } catch {
      /* video is best-effort — the step screenshots still drive a fallback GIF */
    }
  }
});
