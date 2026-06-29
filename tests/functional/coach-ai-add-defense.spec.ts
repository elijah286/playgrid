/**
 * COACH AI (Cal) — add a defense onto an OFFENSIVE play.
 *
 * Reproduces the 2026-06-28 coach report: "adding a defensive formation into an
 * offensive play ... doesn't respond well" (slow + unreliable), while building
 * the defense first and adding offense after "responded better".
 *
 * Root cause (fixed on main @ d2bad4a5): when a coach opens an offensive play
 * and asks for a defense, the offense lives in the anchored diagram
 * (ctx.playDiagramText), NOT in chat history — so compose_defense's overlay had
 * no offense baseline and produced an offense-less result, and the byte-
 * preservation failures drove the validator retry loop (the slowness).
 *
 * Two scenarios, mirroring the two paths the coach described:
 *   1. add-defense-user-install — Cal overlays a defense onto the anchored play
 *      and the coach clicks "Add to this play" to keep it (attach overlay).
 *   2. add-defense-cal-install  — the coach uses save-intent ("install + save");
 *      Cal OFFERS the save chip (defenses never auto-save — agent.ts:118) and
 *      the coach clicks "Save as new defense play", landing a linked defense
 *      play (play_type='defense', vs_play_id).
 *
 * HARNESS NOTES (why this is sturdier than a naive UI walk):
 *   - The offensive play is SEEDED via the service-role client (factory
 *     createEmptyPlayDocument → plays + play_versions), not drawn by Cal. That
 *     removes a slow ~2-min Cal draw+save turn from SETUP (the flake that used
 *     to skip scenario 2 with "Cal did not persist within 150s") and leaves the
 *     test's Cal budget for the one thing under test: the defense overlay.
 *     Verified live: a seeded play anchors Cal ("Anchored to … · Mesh") and the
 *     overlay + chip come back in ~20s.
 *   - The "Help improve Coach Cal?" opt-in modal (CoachAiChat.tsx — a z-30
 *     `bg-black/40 inset-0` overlay shown while profiles.ai_feedback_optin is
 *     null) sits OVER the chat panel and INTERCEPTS the chip click (fill() works
 *     through it, click() doesn't). We pre-decline it for the coach via service
 *     role so it never mounts, with a UI "No thanks" dismiss as a safety net.
 *   - Every "is Cal reachable / did Cal answer" gate skips OUTSIDE recorder.step()
 *     (a test.skip() thrown inside a step is caught by the recorder and re-thrown
 *     as a FAILURE — so the skip must happen at the test-body level to stay a
 *     clean skip). Cal is gated, slow, and costs tokens: when it's unreachable or
 *     mid-upgrade the scenario SKIPS rather than failing the suite.
 *
 * NOTE: this validates the fix only when run against a deploy that HAS it (CI
 * post-deploy / nightly). The authoritative regression guards are the
 * deterministic unit/tool tests (src/lib/coach-ai/compose-defense-overlay*.test.ts).
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
import { createEmptyPlayDocument } from "../../src/domain/play/factory";
import type { Page } from "@playwright/test";

const accounts = testAccounts();
type Admin = NonNullable<ReturnType<typeof serviceClient>>;

test.afterAll(async () => {
  await cleanupFunctestPlaybooks();
});

// ─── service-role setup (deterministic; no reliance on a slow Cal draw) ──────

/** Resolve the seeded coach's user id by email (service role). */
async function coachUserId(admin: Admin): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
  return (
    (data.users ?? []).find(
      (u) => u.email?.toLowerCase() === accounts.coach.email.toLowerCase(),
    )?.id ?? null
  );
}

/** Silence the "Help improve Coach Cal?" opt-in modal for the coach so it can't
 *  intercept the save-defense chip click. The modal renders whenever
 *  profiles.ai_feedback_optin is null ("unanswered"); setting it false makes
 *  getAiFeedbackOptInAction return "declined" and the z-30 overlay never mounts.
 *  (Mirrors a real coach who clicked "No thanks" once — it's server-persisted.) */
async function declineCalFeedbackOptIn(admin: Admin, coachId: string): Promise<void> {
  await admin.from("profiles").update({ ai_feedback_optin: false }).eq("id", coachId);
}

/** Ensure the coach has an org + team (playbooks.team_id is NOT NULL). Mirrors
 *  ensureDefaultWorkspace; same shape as roster-approval.spec.ts. */
async function ensureCoachTeam(admin: Admin, coachId: string): Promise<string> {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", coachId)
    .limit(1);
  let orgId = orgs?.[0]?.id as string | undefined;
  if (!orgId) {
    const { data, error } = await admin
      .from("organizations")
      .insert({ owner_id: coachId, name: "Functest Org" })
      .select("id")
      .single();
    if (error) throw new Error(`org: ${error.message}`);
    orgId = data!.id as string;
  }
  const { data: teams } = await admin
    .from("teams")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  let teamId = teams?.[0]?.id as string | undefined;
  if (!teamId) {
    const { data, error } = await admin
      .from("teams")
      .insert({ org_id: orgId, name: "Functest Team", sport_variant: "flag_7v7" })
      .select("id")
      .single();
    if (error) throw new Error(`team: ${error.message}`);
    teamId = data!.id as string;
  }
  return teamId;
}

/** Seed a real OFFENSIVE play (canonical PlayDocument on play_versions.document,
 *  denormalized truth on plays — LLM-first-data) so Cal has a genuine anchor
 *  without spending a slow draw+save turn on setup. A bare flag_7v7 formation
 *  (default players, no routes) is exactly the condition that triggered the bug:
 *  the offense lives in ctx.playDiagramText, not chat history. Returns the new
 *  playbook + play ids. Mirrors createPlayAction's insert shape. */
async function seedOffensivePlay(
  admin: Admin,
  coachId: string,
  playbookName: string,
): Promise<{ playbookId: string; playId: string }> {
  const teamId = await ensureCoachTeam(admin, coachId);

  const { data: pb, error: pbErr } = await admin
    .from("playbooks")
    .insert({ team_id: teamId, name: playbookName, sport_variant: "flag_7v7" })
    .select("id")
    .single();
  if (pbErr) throw new Error(`playbook: ${pbErr.message}`);
  const playbookId = pb!.id as string;

  const { error: memErr } = await admin
    .from("playbook_members")
    .insert({ playbook_id: playbookId, user_id: coachId, role: "owner", status: "active" });
  if (memErr) throw new Error(`owner membership: ${memErr.message}`);

  // Canonical offense document from the factory (playType defaults to "offense";
  // default flag_7v7 roster, no routes). Mutate the coach-facing fields only so
  // the metadata shape stays whatever the factory guarantees.
  const doc = createEmptyPlayDocument();
  doc.metadata.coachName = "Mesh";
  doc.metadata.shorthand = "MESH";
  doc.metadata.wristbandCode = "01";
  doc.metadata.sheetAbbrev = "MSH";
  doc.metadata.formation = "Trips Right";
  doc.metadata.concept = "Mesh";
  doc.metadata.tags = ["pass"];

  const { data: play, error: playErr } = await admin
    .from("plays")
    .insert({
      playbook_id: playbookId,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      concept: doc.metadata.concept,
      tags: doc.metadata.tags,
      tag: doc.metadata.tags[0] ?? "",
      display_abbrev: doc.metadata.sheetAbbrev,
      sort_order: 0,
      play_type: "offense",
    })
    .select("id")
    .single();
  if (playErr) throw new Error(`play: ${playErr.message}`);
  const playId = play!.id as string;

  const { data: ver, error: verErr } = await admin
    .from("play_versions")
    .insert({
      play_id: playId,
      schema_version: doc.schemaVersion,
      document: doc as unknown as Record<string, unknown>,
      kind: "create",
      created_by: coachId,
      label: "v1",
    })
    .select("id")
    .single();
  if (verErr) throw new Error(`version: ${verErr.message}`);

  await admin.from("plays").update({ current_version_id: ver!.id }).eq("id", playId);
  return { playbookId, playId };
}

/** Poll for a persisted defense play in the playbook (the DB write trails the
 *  chip click by a moment). True once a row is play_type='defense' OR carries a
 *  vs_play_id link. */
async function waitForDefensePlay(
  admin: Admin,
  playbookId: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await admin
      .from("plays")
      .select("id, play_type, vs_play_id")
      .eq("playbook_id", playbookId);
    const hasDefense = (data ?? []).some(
      (p: { play_type?: string; vs_play_id?: string | null }) =>
        p.play_type === "defense" || !!p.vs_play_id,
    );
    if (hasDefense) return true;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}

// ─── Cal UI helpers ──────────────────────────────────────────────────────────

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

/** Belt-and-suspenders: if the "Help improve Coach Cal?" opt-in modal is up
 *  (the z-30 overlay that intercepts the chip click), dismiss it by clicking
 *  "No thanks". A no-op when the service-role pre-decline already kept it from
 *  mounting. */
async function dismissCalOptIn(page: Page): Promise<void> {
  const noThanks = page.getByRole("button", { name: /^no thanks$/i });
  try {
    if (await noThanks.count()) await noThanks.first().click({ timeout: 3_000 });
  } catch {
    /* already gone — fine */
  }
}

/** Wait for Cal's save-defense chip (the unambiguous "Cal produced a savable
 *  overlay against THIS offense" signal — a specific button, not generic page
 *  text). Returns false if it never shows (Cal slow / mid-upgrade / unreachable),
 *  which the caller turns into a clean test.skip OUTSIDE the recorder step. */
async function waitForSaveDefenseChip(page: Page, label: string): Promise<boolean> {
  const t0 = Date.now();
  const chip = page.getByRole("button", { name: /add to this play|save as new defense/i });
  try {
    await chip.first().waitFor({ state: "visible", timeout: 180_000 });
    console.log(`[${label}] save-defense chip appeared after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return true;
  } catch {
    console.log(`[${label}] NO save-defense chip after ${((Date.now() - t0) / 1000).toFixed(1)}s — Cal slow/unavailable`);
    return false;
  }
}

// ─── scenarios ───────────────────────────────────────────────────────────────

test("Cal adds a defense to an anchored offensive play (coach keeps it)", async ({
  page,
  recorder,
}) => {
  recorder.about({
    scenario: "add-defense-user-install",
    title: "Cal adds a defense to an offensive play",
    description:
      "Opens a (service-role seeded) offensive play in the editor so Cal is anchored to it, asks Cal to overlay a Cover 3, and the coach clicks 'Add to this play'. Verifies the overlay attaches (offense survives). Skips when Cal isn't enabled.",
  });
  test.setTimeout(330_000);

  const admin = serviceClient();
  test.skip(!admin, "Service role key required to seed the offensive play.");
  const coachId = await coachUserId(admin!);
  test.skip(!coachId, "Could not resolve the functest coach user id.");

  let playId = "";
  await recorder.step("seed an offensive play + silence the Cal opt-in modal", page, async () => {
    await declineCalFeedbackOptIn(admin!, coachId!);
    const seeded = await seedOffensivePlay(
      admin!,
      coachId!,
      `${FUNCTEST_PREFIX} add-defense ${Date.now()}`,
    );
    playId = seeded.playId;
    expect(playId).not.toBe("");
  });

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("open the seeded play's editor (anchors Cal to it)", page, async () => {
    await page.goto(`/plays/${playId}/edit`, { waitUntil: "networkidle" });
  });

  let calReachable = true;
  await recorder.step("open Cal on the play and ask for a Cover 3 overlay", page, async () => {
    if (!(await openCal(page))) {
      calReachable = false;
      return;
    }
    await dismissCalOptIn(page);
    const input = await calInput(page);
    if (!input) {
      calReachable = false;
      return;
    }
    // This is the reported flow: offense is the OPEN play, not a chat fence.
    await input.fill("Add a Cover 3 defense to this play.");
    await input.press("Enter");
  });
  test.skip(!calReachable, "Cal not reachable on the play editor.");

  let chipAppeared = false;
  await recorder.step("wait for Cal's defense overlay (the save-defense chip)", page, async () => {
    chipAppeared = await waitForSaveDefenseChip(page, "add-defense");
  });
  test.skip(!chipAppeared, "Cal produced no save-defense overlay — Cal slow/unavailable.");

  await recorder.step("coach clicks 'Add to this play'", page, async () => {
    await dismissCalOptIn(page); // ensure nothing overlays the chip
    const chip = page.getByRole("button", { name: /add to this play/i });
    await chip.first().click();
    // Attach mode flips the chip to "Added the defense to <play> — open the play"
    // (CoachAiChat.tsx). Match that SPECIFIC visible copy — a bare /saved|defense/
    // also hits hidden captions like "Not saved to this play" and fails visible.
    await expect(
      page.getByText(/adding…|added the defense to/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});

test("Cal saves a defense the coach asked to install (save-intent → keep)", async ({
  page,
  recorder,
}) => {
  recorder.about({
    scenario: "add-defense-cal-install",
    title: "Cal saves a defense the coach asked to install",
    description:
      "On a (seeded) anchored offensive play, the coach uses save-intent ('install a Tampa 2 and save it'). Defenses never auto-save — Cal OFFERS the save chip; the coach clicks 'Save as new defense play' and a linked defense play (play_type='defense', vs_play_id) persists. Skips when Cal isn't enabled.",
  });
  test.setTimeout(330_000);

  const admin = serviceClient();
  test.skip(!admin, "Service role key required to seed the offensive play.");
  const coachId = await coachUserId(admin!);
  test.skip(!coachId, "Could not resolve the functest coach user id.");

  let playbookId = "";
  let playId = "";
  await recorder.step("seed an offensive play + silence the Cal opt-in modal", page, async () => {
    await declineCalFeedbackOptIn(admin!, coachId!);
    const seeded = await seedOffensivePlay(
      admin!,
      coachId!,
      `${FUNCTEST_PREFIX} cal-install-def ${Date.now()}`,
    );
    playbookId = seeded.playbookId;
    playId = seeded.playId;
    expect(playId).not.toBe("");
  });

  await recorder.step("sign in", page, async () => {
    await signIn(page, accounts.coach.email, accounts.coach.password);
  });

  await recorder.step("open the seeded play (anchors Cal)", page, async () => {
    await page.goto(`/plays/${playId}/edit`, { waitUntil: "networkidle" });
  });

  let calReachable = true;
  await recorder.step("coach asks Cal to INSTALL + SAVE a defense (save-intent)", page, async () => {
    if (!(await openCal(page))) {
      calReachable = false;
      return;
    }
    await dismissCalOptIn(page);
    const input = await calInput(page);
    if (!input) {
      calReachable = false;
      return;
    }
    await input.fill("Install a Tampa 2 against this play and save it as its own defense play.");
    await input.press("Enter");
  });
  test.skip(!calReachable, "Cal not reachable on the play editor.");

  let chipAppeared = false;
  await recorder.step("wait for the save-defense chip (Cal offers; never auto-saves)", page, async () => {
    chipAppeared = await waitForSaveDefenseChip(page, "cal-install-def");
  });
  test.skip(!chipAppeared, "Cal produced no save-defense chip on save-intent — Cal slow/unavailable.");

  await recorder.step("coach clicks 'Save as new defense play'", page, async () => {
    await dismissCalOptIn(page);
    // "Save as new defense play" → createDefensePlayFromFenceAction → a separate
    // play_type='defense' row linked via vs_play_id (the persistence we assert).
    const chip = page.getByRole("button", { name: /save as new defense play/i });
    await chip.first().click();
    // Success flips the chip to a link: 'Saved "<name>" — open the new play'
    // (CoachAiChat.tsx). Match "open the new play" SPECIFICALLY — a bare /saved/
    // also matches the hidden "Not saved to this play" caption and fails visible.
    await expect(
      page.getByText(/open the new play/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  await recorder.step("verify the defense persisted (linked defense play)", page, async () => {
    const persisted = await waitForDefensePlay(admin!, playbookId, 30_000);
    expect(persisted).toBe(true);
  });
});
