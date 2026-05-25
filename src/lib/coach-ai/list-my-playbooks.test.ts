/**
 * Regression tests for `list_my_playbooks` — the playbook chip-picker
 * tool. Production bug 2026-05-25:
 *
 * A coach was chatting with Cal anchored to a playbook ("Reddit
 * Drawings"). The system prompt's "Anchored playbook" block showed the
 * playbook name, sport variant, and "Coach can edit this playbook:
 * yes". The coach asked Cal to install defensive plays, and Cal
 * called `list_my_playbooks` before composing — surfacing the
 * chip-picker even though the active playbook was unambiguous.
 *
 * The tool's prior behavior was to query the DB and return chips
 * regardless of context. This caused two coach-facing symptoms:
 *   1. The coach sees a "Pick a team:" prompt mid-conversation when
 *      they're clearly already on a team.
 *   2. Cal burns a tool call on a no-op AND can route the eventual
 *      saves to the wrong playbook if the coach taps a different
 *      chip than the anchored one.
 *
 * Fix: when `ctx.playbookId` is set AND the coach can edit it, the
 * handler short-circuits with an error message instructing Cal to
 * use the anchored playbook directly. The error path also passes
 * the playbook id/name back to Cal so the next tool call has the
 * context it needs.
 *
 * This is the Rule 4 enforcement layer ("All play writes route
 * through the spec resolver") applied to the discovery tool: the
 * resolver path can't switch playbooks mid-conversation, so the
 * discovery tool shouldn't pretend that's an option.
 */

import { describe, expect, it } from "vitest";
import { BASE_TOOLS, type ToolContext } from "./tools";

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS — registration regression`);
  return tool;
}

const BASE_CTX: ToolContext = {
  playbookId: null,
  playbookName: null,
  sportVariant: null,
  gameLevel: null,
  sanctioningBody: null,
  ageDivision: null,
  playbookSettings: null,
  isAdmin: false,
  canEditPlaybook: false,
  mode: "normal",
  timezone: null,
  playId: null,
  playName: null,
  playFormation: null,
  playDiagramText: null,
  playDiagramRecap: null,
  threadId: null,
  userId: null,
};

describe("list_my_playbooks — anchored-playbook guard", () => {
  it("is registered in BASE_TOOLS", () => {
    expect(loadTool("list_my_playbooks")).toBeDefined();
  });

  it("refuses with a redirecting error when a playbook is already anchored", async () => {
    const tool = loadTool("list_my_playbooks");
    const ctx: ToolContext = {
      ...BASE_CTX,
      playbookId: "pb-uuid-123",
      playbookName: "Reddit Drawings",
      sportVariant: "tackle_11",
      canEditPlaybook: true,
    };
    const r = await tool.handler({}, ctx);
    // The handler must REFUSE — calling list_my_playbooks when
    // anchored produces a coach-visible "Pick a team:" prompt mid-
    // conversation, which is a regression. Refuse and instruct Cal
    // to use the anchored playbook directly.
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Error message must NAME the anchored playbook so Cal can use
    // it directly on the next tool call.
    expect(r.error).toMatch(/Reddit Drawings/);
    // Error must direct Cal to use the anchored playbook, not list.
    expect(r.error).toMatch(/anchored|already.*open|use.*directly/i);
    // Must mention "do not retry" or equivalent so Cal doesn't loop
    // on the same tool call.
    expect(r.error.toLowerCase()).toMatch(
      /do not retry|don't retry|do not call.*list_my_playbooks|skip this tool/,
    );
  });

  it("refuses even when canEditPlaybook is false (anchored READ-ONLY view)", async () => {
    // The coach is viewing an example/template/foreign playbook in
    // read-only mode. Cal still shouldn't surface the picker — the
    // anchored context is still the right scope for follow-ups.
    const tool = loadTool("list_my_playbooks");
    const ctx: ToolContext = {
      ...BASE_CTX,
      playbookId: "pb-readonly-456",
      playbookName: "Example Flag Playbook",
      sportVariant: "flag_7v7",
      canEditPlaybook: false,
    };
    const r = await tool.handler({}, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Example Flag Playbook/);
  });

  it("allows listing when NO playbook is anchored (lobby mode)", async () => {
    // The legitimate use case: coach opened Cal from the home page,
    // no playbook in scope. The tool must STILL work here — this is
    // the path Rule 8a (lobby-mode ASK-FIRST) depends on. The test
    // doesn't assert the DB result (no Supabase in unit tests) — it
    // only asserts the handler doesn't refuse on the guard.
    const tool = loadTool("list_my_playbooks");
    const ctx: ToolContext = { ...BASE_CTX, playbookId: null };
    const r = await tool.handler({}, ctx);
    // The handler will likely return an auth error or empty result
    // in unit tests (no Supabase user). The point of this test is
    // that the GUARD doesn't fire — so we check it didn't return
    // the guard's specific error.
    if (!r.ok) {
      expect(r.error).not.toMatch(/anchored|already.*open|do not retry/i);
    }
  });
});
