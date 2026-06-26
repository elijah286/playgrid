/**
 * INVITE → ACCEPT — the regression that started all of this.
 *
 * A coach creates a playbook + a player invite link; the player opens it and
 * accepts. The load-bearing assertion is that accepting does NOT surface the
 * "Could not accept invite…" toast (the 42P10 the broken accept_invite RPC
 * produced) and DOES reach a success state. This is the scenario that, had it
 * existed, would have caught the bug before a customer canceled.
 *
 * Selectors for the create/share flow are inferred from the app and may need a
 * pass on first local run; the accept selectors come from AcceptInviteButton.
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

test("invite → accept", async ({ browser, recorder }) => {
  recorder.scenario = "invite-accept";
  const playbookName = `${FUNCTEST_PREFIX} invite ${Date.now()}`;
  let inviteUrl = "";

  // ── Coach: create a throwaway playbook + a player invite link ──────────────
  const coachCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  try {
    await recorder.step("coach signs in", coach, async () => {
      await signIn(coach, accounts.coach.email, accounts.coach.password);
    });

    await recorder.step("coach creates a playbook", coach, async () => {
      await coach.goto("/home", { waitUntil: "networkidle" });
      await coach.getByRole("button", { name: /new playbook/i }).first().click();
      await coach.getByRole("textbox").first().fill(playbookName);
      await coach
        .getByRole("button", { name: /create|continue|next|save|done|finish/i })
        .first()
        .click();
      await coach.waitForURL(/\/playbooks\/[0-9a-f-]+/i, { timeout: 20_000 });
    });

    await recorder.step("coach creates a player invite link", coach, async () => {
      await coach.getByRole("button", { name: /invite|share/i }).first().click();
      await coach
        .getByRole("button", { name: /create link|invite players?|generate|new link/i })
        .first()
        .click();
      const link = coach.locator('input[readonly], a[href*="/invite/"]').first();
      await link.waitFor({ timeout: 10_000 });
      inviteUrl =
        (await link.getAttribute("value")) || (await link.getAttribute("href")) || "";
      expect(inviteUrl, "invite URL should be present in the share dialog").toContain(
        "/invite/",
      );
    });
  } finally {
    await coachCtx.close();
  }

  // ── Player: accept the invite via the real accept page ─────────────────────
  const playerCtx = await browser.newContext();
  const player = await playerCtx.newPage();
  try {
    await recorder.step("player signs in", player, async () => {
      await signIn(player, accounts.player.email, accounts.player.password);
    });

    await recorder.step("player opens the invite link", player, async () => {
      const path = inviteUrl.replace(/^https?:\/\/[^/]+/, "");
      await player.goto(path, { waitUntil: "networkidle" });
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
});
