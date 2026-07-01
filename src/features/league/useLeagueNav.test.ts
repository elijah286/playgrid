import { describe, it, expect } from "vitest";

import { leagueSections } from "./useLeagueNav";

describe("leagueSections — capability-aware nav", () => {
  it("members (null capabilities) see the full section list, including Store", () => {
    const paths = leagueSections("football", false, null).map((s) => s.path);
    expect(paths).toContain(""); // Overview
    expect(paths).toContain("/store");
    expect(paths).toContain("/registration");
    expect(paths).toContain("/financials");
    expect(paths).toContain("/settings");
  });

  it("a manage_store-only delegate sees Overview + Store and nothing else gated", () => {
    const paths = leagueSections("football", false, ["manage_store"]).map((s) => s.path);
    expect(paths).toEqual(["", "/store"]);
  });

  it("a manage_registration delegate sees Registration, not Store or Financials", () => {
    const paths = leagueSections("football", false, ["manage_registration"]).map((s) => s.path);
    expect(paths[0]).toBe(""); // Overview always first
    expect(paths).toContain("/registration");
    expect(paths).not.toContain("/store");
    expect(paths).not.toContain("/financials");
  });

  it("manage_teams covers both Teams and Divisions but not Roster", () => {
    const paths = leagueSections("football", false, ["manage_teams"]).map((s) => s.path);
    expect(paths).toContain("/teams");
    expect(paths).toContain("/divisions");
    expect(paths).not.toContain("/roster");
  });

  it("Overview and Leo carry no capability gate (Leo shows for any delegate when enabled)", () => {
    const paths = leagueSections("football", true, ["manage_store"]).map((s) => s.path);
    expect(paths[0]).toBe(""); // Overview
    expect(paths).toContain("/assistant"); // Leo, despite no matching capability
  });
});
