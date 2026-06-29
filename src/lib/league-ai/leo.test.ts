import { describe, it, expect, afterEach } from "vitest";

import { leagueReadToolDefs, LEAGUE_READ_TOOL_NAMES, LEAGUE_TOOLS } from "./tools";
import { leagueAiEnabled } from "@/lib/league/access";

describe("Leo read-only tool surface (v1 safety invariant)", () => {
  it("offers only read tools — no consequential tool leaks to the model", () => {
    const readNames = new Set(leagueReadToolDefs().map((d) => d.name));
    for (const t of LEAGUE_TOOLS) {
      if (t.kind === "consequential") {
        expect(readNames.has(t.def.name)).toBe(false);
        expect(LEAGUE_READ_TOOL_NAMES.has(t.def.name)).toBe(false);
      }
    }
  });

  it("specifically excludes the known write tools", () => {
    const readNames = new Set(leagueReadToolDefs().map((d) => d.name));
    for (const name of [
      "send_announcement",
      "send_group_announcement",
      "rename_league",
      "set_registration_link",
    ]) {
      expect(readNames.has(name)).toBe(false);
    }
  });

  it("includes the core read tools Leo needs", () => {
    const readNames = new Set(leagueReadToolDefs().map((d) => d.name));
    expect(readNames.has("league_overview")).toBe(true);
    expect(readNames.has("list_unrostered_players")).toBe(true);
    expect(readNames.has("get_league_settings")).toBe(true);
  });
});

describe("leagueAiEnabled — Leo beta gate", () => {
  const prev = {
    ai: process.env.LEAGUE_AI_ENABLED,
    ops: process.env.LEAGUE_OPS_ENABLED,
  };
  afterEach(() => {
    process.env.LEAGUE_AI_ENABLED = prev.ai;
    process.env.LEAGUE_OPS_ENABLED = prev.ops;
  });

  it("is OFF by default (ships dark)", () => {
    delete process.env.LEAGUE_AI_ENABLED;
    delete process.env.LEAGUE_OPS_ENABLED;
    expect(leagueAiEnabled()).toBe(false);
  });

  it("is ON when LEAGUE_AI_ENABLED=on", () => {
    delete process.env.LEAGUE_OPS_ENABLED;
    process.env.LEAGUE_AI_ENABLED = "on";
    expect(leagueAiEnabled()).toBe(true);
  });

  it("stays OFF when the platform kill switch is off, even with LEAGUE_AI_ENABLED=on", () => {
    process.env.LEAGUE_AI_ENABLED = "on";
    process.env.LEAGUE_OPS_ENABLED = "off";
    expect(leagueAiEnabled()).toBe(false);
  });
});
