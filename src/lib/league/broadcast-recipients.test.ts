import { describe, expect, it } from "vitest";

import { audienceLabel, familyEmailsFromRegistrations } from "./broadcast-recipients";

const reg = (email: string | null, status: string, teamId: string | null = null) => ({
  applicant: email ? { guardian: { email } } : {},
  status,
  team_id: teamId,
});

describe("familyEmailsFromRegistrations", () => {
  it("collects distinct active-family emails, lowercased", () => {
    const rows = [
      reg("A@x.com", "approved"),
      reg("a@x.com", "rostered"), // dup (case)
      reg("b@x.com", "submitted"),
      reg("c@x.com", "waitlisted"),
    ];
    expect(familyEmailsFromRegistrations(rows).sort()).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("excludes rejected/withdrawn families and rows with no email", () => {
    const rows = [
      reg("keep@x.com", "approved"),
      reg("gone@x.com", "rejected"),
      reg("gone2@x.com", "withdrawn"),
      reg(null, "approved"),
    ];
    expect(familyEmailsFromRegistrations(rows)).toEqual(["keep@x.com"]);
  });

  it("scopes to a team when teamId is given", () => {
    const rows = [
      reg("t1@x.com", "rostered", "team-1"),
      reg("t2@x.com", "rostered", "team-2"),
      reg("none@x.com", "approved", null),
    ];
    expect(familyEmailsFromRegistrations(rows, "team-1")).toEqual(["t1@x.com"]);
  });
});

describe("audienceLabel", () => {
  it("labels each audience kind", () => {
    expect(audienceLabel({ kind: "everyone" })).toBe("Everyone");
    expect(audienceLabel({ kind: "families" })).toBe("All families");
    expect(audienceLabel({ kind: "coaches" })).toBe("Coaches");
    expect(audienceLabel({ kind: "team", teamId: "t" }, "Hawks")).toBe("Team: Hawks");
  });
});
