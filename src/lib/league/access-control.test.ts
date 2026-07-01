import { describe, it, expect } from "vitest";

import {
  ALL_CAPABILITIES,
  capabilitiesForRole,
  decideLeagueView,
  grantsCover,
  roleForCapabilities,
  scopeIncludesLeague,
  isCapability,
  type AccessScope,
} from "./access-control";

describe("role presets", () => {
  it("admin gets every capability; league_manager all but manage_members", () => {
    expect(capabilitiesForRole("admin")).toEqual(ALL_CAPABILITIES);
    const mgr = capabilitiesForRole("league_manager");
    expect(mgr).not.toContain("manage_members");
    expect(mgr).toContain("manage_store");
    expect(mgr.length).toBe(ALL_CAPABILITIES.length - 1);
  });

  it("scoped presets bundle the right capabilities", () => {
    expect(capabilitiesForRole("merch_manager")).toEqual(["manage_store"]);
    expect(capabilitiesForRole("scorekeeper")).toEqual(["manage_schedule"]);
    expect(capabilitiesForRole("registrar")).toEqual(["manage_registration", "manage_rosters"]);
    expect(capabilitiesForRole("viewer")).toEqual([]);
  });

  it("round-trips capabilities back to a preset, else custom", () => {
    expect(roleForCapabilities(["manage_store"])).toBe("merch_manager");
    expect(roleForCapabilities([...ALL_CAPABILITIES])).toBe("admin");
    expect(roleForCapabilities([])).toBe("viewer");
    expect(roleForCapabilities(["manage_store", "manage_schedule"])).toBe("custom");
  });

  it("isCapability validates keys", () => {
    expect(isCapability("manage_store")).toBe(true);
    expect(isCapability("delete_everything")).toBe(false);
  });
});

describe("scopeIncludesLeague", () => {
  const league = { id: "L1", sport: "baseball", groupIds: ["G-waco"] };

  it("portfolio covers everything", () => {
    expect(scopeIncludesLeague({ kind: "portfolio" }, league)).toBe(true);
  });
  it("leagues scope matches by id", () => {
    expect(scopeIncludesLeague({ kind: "leagues", leagueIds: ["L1", "L2"] }, league)).toBe(true);
    expect(scopeIncludesLeague({ kind: "leagues", leagueIds: ["L2"] }, league)).toBe(false);
  });
  it("sport scope matches by league sport (baseball across all leagues)", () => {
    expect(scopeIncludesLeague({ kind: "sport", sport: "baseball" }, league)).toBe(true);
    expect(scopeIncludesLeague({ kind: "sport", sport: "soccer" }, league)).toBe(false);
  });
  it("group scope matches by membership", () => {
    expect(scopeIncludesLeague({ kind: "group", groupId: "G-waco" }, league)).toBe(true);
    expect(scopeIncludesLeague({ kind: "group", groupId: "G-austin" }, league)).toBe(false);
  });
  it("exhaustive over scope kinds", () => {
    const scopes: AccessScope[] = [
      { kind: "portfolio" },
      { kind: "leagues", leagueIds: [] },
      { kind: "sport", sport: "x" },
      { kind: "group", groupId: "x" },
    ];
    for (const s of scopes) expect(typeof scopeIncludesLeague(s, league)).toBe("boolean");
  });
});

describe("grantsCover (the can() decision)", () => {
  const baseball = { id: "L1", sport: "baseball", groupIds: ["G-waco"] };
  const soccer = { id: "L2", sport: "soccer", groupIds: [] };

  it("portfolio grant covers the capability anywhere", () => {
    const grants = [{ capabilities: ["manage_store"], scope: { kind: "portfolio" } as AccessScope }];
    expect(grantsCover(grants, "manage_store", baseball)).toBe(true);
    expect(grantsCover(grants, "manage_store", soccer)).toBe(true);
  });

  it("denies a capability the grant doesn't include", () => {
    const grants = [{ capabilities: ["manage_store"], scope: { kind: "portfolio" } as AccessScope }];
    expect(grantsCover(grants, "manage_rosters", baseball)).toBe(false);
  });

  it("sport scope only covers matching-sport leagues (baseball everywhere)", () => {
    const grants = [{ capabilities: ["manage_rosters"], scope: { kind: "sport", sport: "baseball" } as AccessScope }];
    expect(grantsCover(grants, "manage_rosters", baseball)).toBe(true);
    expect(grantsCover(grants, "manage_rosters", soccer)).toBe(false);
  });

  it("league/group scopes gate by membership", () => {
    expect(grantsCover([{ capabilities: ["manage_schedule"], scope: { kind: "leagues", leagueIds: ["L1"] } }], "manage_schedule", baseball)).toBe(true);
    expect(grantsCover([{ capabilities: ["manage_schedule"], scope: { kind: "leagues", leagueIds: ["L9"] } }], "manage_schedule", baseball)).toBe(false);
    expect(grantsCover([{ capabilities: ["manage_store"], scope: { kind: "group", groupId: "G-waco" } }], "manage_store", baseball)).toBe(true);
  });

  it("any covering grant among several is enough", () => {
    const grants = [
      { capabilities: ["manage_store"], scope: { kind: "leagues", leagueIds: ["L9"] } as AccessScope },
      { capabilities: ["manage_rosters"], scope: { kind: "sport", sport: "baseball" } as AccessScope },
    ];
    expect(grantsCover(grants, "manage_rosters", baseball)).toBe(true);
    expect(grantsCover(grants, "manage_store", baseball)).toBe(false);
  });
});

describe("decideLeagueView (console page access)", () => {
  it("admits any member to a plain page; a coach is denied on an admin-only page", () => {
    // Non-admin member (e.g. a coach) may view a plain page…
    expect(
      decideLeagueView({ isMember: true, isAdminMember: false, delegateCapabilities: [] }),
    ).toEqual({ via: "member", isAdmin: false });
    // …but not an admin-only page.
    expect(
      decideLeagueView(
        { isMember: true, isAdminMember: false, delegateCapabilities: [] },
        { memberAdminOnly: true },
      ),
    ).toBeNull();
    // An admin-role member passes the admin-only gate.
    expect(
      decideLeagueView(
        { isMember: true, isAdminMember: true, delegateCapabilities: [] },
        { memberAdminOnly: true },
      ),
    ).toEqual({ via: "member", isAdmin: true });
  });

  it("member gate ignores grant capabilities (members never take the delegate path)", () => {
    // A member with no caps still passes; delegateCapability is a delegate-only concern.
    expect(
      decideLeagueView(
        { isMember: true, isAdminMember: true, delegateCapabilities: [] },
        { memberAdminOnly: true, delegateCapability: "manage_rosters" },
      ),
    ).toEqual({ via: "member", isAdmin: true });
  });

  it("admits a delegate holding the page's capability; denies without it", () => {
    expect(
      decideLeagueView(
        { isMember: false, isAdminMember: false, delegateCapabilities: ["manage_rosters"] },
        { delegateCapability: "manage_rosters" },
      ),
    ).toEqual({ via: "delegate", isAdmin: true });
    expect(
      decideLeagueView(
        { isMember: false, isAdminMember: false, delegateCapabilities: ["manage_store"] },
        { delegateCapability: "manage_rosters" },
      ),
    ).toBeNull();
  });

  it("admits a delegate with ANY grant to a plain page (no specific capability required)", () => {
    expect(
      decideLeagueView({
        isMember: false,
        isAdminMember: false,
        delegateCapabilities: ["manage_store"],
      }),
    ).toEqual({ via: "delegate", isAdmin: true });
  });

  it("denies a user who is neither a member nor a covering delegate", () => {
    expect(
      decideLeagueView({ isMember: false, isAdminMember: false, delegateCapabilities: [] }),
    ).toBeNull();
    expect(
      decideLeagueView(
        { isMember: false, isAdminMember: false, delegateCapabilities: [] },
        { delegateCapability: "manage_teams" },
      ),
    ).toBeNull();
  });
});
