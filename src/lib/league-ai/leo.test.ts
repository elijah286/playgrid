import { describe, it, expect, afterEach } from "vitest";

import {
  leagueReadToolDefs,
  LEAGUE_READ_TOOL_NAMES,
  LEAGUE_CONSEQUENTIAL_TOOL_NAMES,
  LEAGUE_TOOLS,
} from "./tools";
import { describeProposal } from "./propose";
import { leagueAiEnabled, leagueAiWritesEnabled } from "@/lib/league/access";

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
    expect(readNames.has("list_registrations")).toBe(true);
    expect(readNames.has("list_teams")).toBe(true);
    expect(readNames.has("list_curriculum_plans")).toBe(true);
  });

  it("registration triage write is consequential, not a read", () => {
    const readNames = new Set(leagueReadToolDefs().map((d) => d.name));
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("set_registration_status")).toBe(true);
    expect(readNames.has("set_registration_status")).toBe(false);
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

describe("leagueAiWritesEnabled — Leo write gate (staged)", () => {
  const prev = {
    ai: process.env.LEAGUE_AI_ENABLED,
    writes: process.env.LEAGUE_AI_WRITES,
    ops: process.env.LEAGUE_OPS_ENABLED,
  };
  afterEach(() => {
    process.env.LEAGUE_AI_ENABLED = prev.ai;
    process.env.LEAGUE_AI_WRITES = prev.writes;
    process.env.LEAGUE_OPS_ENABLED = prev.ops;
  });

  it("is OFF by default", () => {
    delete process.env.LEAGUE_OPS_ENABLED;
    delete process.env.LEAGUE_AI_ENABLED;
    delete process.env.LEAGUE_AI_WRITES;
    expect(leagueAiWritesEnabled()).toBe(false);
  });

  it("requires BOTH Leo enabled AND writes enabled", () => {
    delete process.env.LEAGUE_OPS_ENABLED;
    // writes on but Leo off → still off
    process.env.LEAGUE_AI_WRITES = "on";
    delete process.env.LEAGUE_AI_ENABLED;
    expect(leagueAiWritesEnabled()).toBe(false);
    // both on → on
    process.env.LEAGUE_AI_ENABLED = "on";
    expect(leagueAiWritesEnabled()).toBe(true);
  });
});

describe("consequential tool set + proposal previews", () => {
  it("the consequential set is exactly the write tools (no read overlap)", () => {
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("send_announcement")).toBe(true);
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("rename_league")).toBe(true);
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("set_registration_link")).toBe(true);
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("create_teams")).toBe(true);
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("assign_team_coach")).toBe(true);
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("place_players_on_team")).toBe(true);
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("unassign_player")).toBe(true);
    expect(LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has("distribute_practice_plan")).toBe(true);
    for (const name of LEAGUE_CONSEQUENTIAL_TOOL_NAMES) {
      expect(LEAGUE_READ_TOOL_NAMES.has(name)).toBe(false);
    }
  });

  it("describeProposal renders a human preview for each write tool", () => {
    expect(describeProposal("rename_league", { name: "Waco Spring" })).toContain("Waco Spring");
    expect(describeProposal("set_registration_link", { slug: "waco-2027" })).toContain(
      "/register/waco-2027",
    );
    expect(describeProposal("set_registration_link", { slug: "" })).toMatch(/clear/i);
    expect(
      describeProposal("send_announcement", { subject: "Picture Day", audience: "families" }),
    ).toContain("Picture Day");
    expect(
      describeProposal("set_registration_status", {
        registrationIds: ["a", "b"],
        status: "approved",
      }),
    ).toBe("Set 2 registrations to approved.");
    expect(
      describeProposal("set_registration_status", { registrationIds: ["a"], status: "waitlisted" }),
    ).toBe("Set 1 registration to waitlisted.");
    expect(describeProposal("create_teams", { names: ["U8 Red", "U8 Blue"] })).toBe(
      "Create 2 teams: U8 Red, U8 Blue.",
    );
    expect(
      describeProposal("assign_team_coach", { teamId: "t1", coachName: "Coach Smith" }),
    ).toContain("Coach Smith");
    expect(
      describeProposal("place_players_on_team", { registrationIds: ["a", "b", "c"], teamId: "t1" }),
    ).toBe("Roster 3 players onto the team.");
    expect(describeProposal("unassign_player", { registrationId: "a" })).toMatch(/remove/i);
    expect(describeProposal("distribute_practice_plan", { planId: "p1" })).toMatch(/share/i);
  });
});
