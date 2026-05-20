import { describe, expect, it } from "vitest";
import { detectAutoAnchorTarget } from "./auto-anchor";

describe("detectAutoAnchorTarget", () => {
  const NEW_ID = "abc12345-1234-5678-90ab-cdef01234567";
  const LINK_TEXT = `Your playbook is ready! [Open Falcons Fall](/playbooks/${NEW_ID}). What plays should we draw first?`;

  it("returns the new playbook id when Cal creates a playbook from the lobby", () => {
    expect(
      detectAutoAnchorTarget(null, "normal", ["create_playbook"], LINK_TEXT),
    ).toBe(NEW_ID);
  });

  it("treats undefined playbookId the same as null (lobby)", () => {
    expect(
      detectAutoAnchorTarget(undefined, "normal", ["create_playbook"], LINK_TEXT),
    ).toBe(NEW_ID);
  });

  it("returns null when already anchored to a playbook (manual create from inside another playbook)", () => {
    expect(
      detectAutoAnchorTarget("existing-pb-id", "normal", ["create_playbook"], LINK_TEXT),
    ).toBeNull();
  });

  it("returns null in admin_training mode (curating the global KB, not coach work)", () => {
    expect(
      detectAutoAnchorTarget(null, "admin_training", ["create_playbook"], LINK_TEXT),
    ).toBeNull();
  });

  it("returns null when create_playbook was not in the tool call list", () => {
    // Cal might cite an existing playbook URL in reply text without having
    // just created it (e.g. summarizing a list). Don't auto-anchor in that case.
    expect(
      detectAutoAnchorTarget(null, "normal", ["search_kb"], LINK_TEXT),
    ).toBeNull();
  });

  it("returns null when tool calls are missing entirely", () => {
    expect(
      detectAutoAnchorTarget(null, "normal", undefined, LINK_TEXT),
    ).toBeNull();
  });

  it("returns null when the reply text has no /playbooks/<id> link (model paraphrased)", () => {
    expect(
      detectAutoAnchorTarget(
        null,
        "normal",
        ["create_playbook"],
        "Done — your playbook is ready. Tell me what plays you want first.",
      ),
    ).toBeNull();
  });

  it("picks the first /playbooks/<id> match when multiple appear", () => {
    const otherId = "zzzzzzzz-1111-2222-3333-444444444444";
    const text = `Created [Falcons](/playbooks/${NEW_ID}) — adapted from your existing [Hawks](/playbooks/${otherId}) playbook.`;
    expect(
      detectAutoAnchorTarget(null, "normal", ["create_playbook"], text),
    ).toBe(NEW_ID);
  });
});
