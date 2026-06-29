import { describe, expect, it } from "vitest";

import { LEAGUE_TOOLS, leagueToolDefs, leagueToolsFor, runLeagueTool } from "./tools";
import type { LeagueToolContext } from "./types";

const adminCtx: LeagueToolContext = { leagueId: "L1", userId: "U1", isLeagueAdmin: true };
const memberCtx: LeagueToolContext = { leagueId: "L1", userId: "U2", isLeagueAdmin: false };

describe("league-ai tool registry", () => {
  it("exposes the seed read tools with well-formed defs", () => {
    const defs = leagueToolDefs(adminCtx);
    expect(defs.length).toBeGreaterThanOrEqual(2);
    for (const d of defs) {
      expect(d.name).toBeTruthy();
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.input_schema).toBeTruthy();
    }
    const names = defs.map((d) => d.name);
    expect(names).toContain("league_overview");
    expect(names).toContain("list_unrostered_players");
  });

  it("every registered tool declares a kind", () => {
    for (const t of LEAGUE_TOOLS) {
      expect(["read", "consequential"]).toContain(t.kind);
    }
  });

  it("send_announcement is a consequential tool (routes through approval)", () => {
    const send = LEAGUE_TOOLS.find((t) => t.def.name === "send_announcement");
    expect(send).toBeDefined();
    expect(send!.kind).toBe("consequential");
  });

  it("consequential tools are hidden from non-admin members; reads are not", () => {
    const memberNames = leagueToolsFor(memberCtx).map((t) => t.def.name);
    expect(memberNames).toContain("league_overview"); // a read tool
    expect(memberNames).not.toContain("send_announcement"); // consequential
    // an admin sees strictly more (the consequential tools too)
    expect(leagueToolsFor(adminCtx).length).toBeGreaterThan(leagueToolsFor(memberCtx).length);
  });

  it("refuses a consequential tool for a non-admin caller", async () => {
    const r = await runLeagueTool("send_announcement", {}, memberCtx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/admin/i);
  });

  it("rejects an unknown tool (no handler invoked)", async () => {
    const r = await runLeagueTool("does_not_exist", {}, adminCtx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown|unavailable/i);
  });
});
