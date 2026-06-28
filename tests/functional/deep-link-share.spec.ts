/**
 * SHARE A DEEP LINK TO AN ARTIFACT — generate a shareable copy link and open it.
 *
 * A coach creates a playbook, then a "Send a copy" deep link (/copy/<token>); a
 * fresh visitor (no session) opens that link and sees the shared playbook
 * preview. Verifies deep links to artifacts resolve and render for a recipient.
 */
import {
  test,
  expect,
  signIn,
  createPlaybook,
  testAccounts,
  cleanupFunctestPlaybooks,
  FUNCTEST_PREFIX,
} from "./_helpers";

const accounts = testAccounts();

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
});

test("share a deep link to a playbook", async ({ browser, recorder }) => {
  recorder.about({
    scenario: "deep-link-share",
    title: "Share a deep link to a playbook",
    description:
      "A coach generates a 'Send a copy' deep link (/copy/<token>) for a playbook; a fresh visitor with no session opens the link and sees the shared playbook preview. Verifies deep links to artifacts resolve and render for a recipient.",
  });
  const name = `${FUNCTEST_PREFIX} deeplink ${Date.now()}`;
  let copyUrl = "";

  const coachCtx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const coach = await coachCtx.newPage();
  try {
    await recorder.step("coach signs in", coach, async () => {
      await signIn(coach, accounts.coach.email, accounts.coach.password);
    });

    let playbookId = "";
    await recorder.step("create a playbook", coach, async () => {
      playbookId = await createPlaybook(coach, name);
      expect(playbookId).not.toBe("");
    });

    await recorder.step("Share → Send a copy → read the deep link", coach, async () => {
      await coach.goto(`/playbooks/${playbookId}?share=1`, { waitUntil: "networkidle" });
      await coach.getByText("Send a copy", { exact: false }).first().click();
      await coach.waitForTimeout(1200);
      copyUrl = await coach.evaluate(() => {
        const v = [...document.querySelectorAll("input,textarea")]
          .map((e) => (e as HTMLInputElement).value)
          .find((val) => val.includes("/copy/"));
        return v || "";
      });
      expect(copyUrl, "Send a copy should expose a /copy/<token> link").toContain("/copy/");
    });
  } finally {
    await coachCtx.close();
  }

  // A fresh visitor (no session) opens the deep link.
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  try {
    await recorder.step("a fresh visitor sees the shared playbook + claim CTA", visitor, async () => {
      const path = copyUrl.replace(/^https?:\/\/[^/]+/, "");
      // The /copy landing streams, so it never reaches "networkidle".
      await visitor.goto(path, { waitUntil: "domcontentloaded" });
      await visitor.waitForTimeout(2500);
      await expect(
        visitor.getByText(/not found|expired|invalid link|something went wrong/i),
      ).toHaveCount(0);
      // The recipient must see the contextual copy preview ("X sent you a copy
      // of …" / "Sign up to claim it") — NOT a bare login wall. This guards the
      // middleware fix that made /copy public to anon recipients.
      await expect(
        visitor.getByText(/sent you a copy|sign up to claim/i).first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  } finally {
    await visitorCtx.close();
  }
});
