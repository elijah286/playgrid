import { describe, expect, it } from "vitest";
import { CAMPAIGNS, campaignDef } from "./campaigns";

describe("campaigns registry", () => {
  it("has unique keys", () => {
    const keys = CAMPAIGNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves a known campaign, and undefined for an unknown one", () => {
    expect(campaignDef("team_invite_nudge")?.label).toBe("Invite your team");
    expect(campaignDef("does_not_exist")).toBeUndefined();
  });

  it("every campaign has a positive conversion window and non-empty labels", () => {
    for (const c of CAMPAIGNS) {
      expect(c.conversionWindowDays).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.conversionLabel.length).toBeGreaterThan(0);
    }
  });
});
