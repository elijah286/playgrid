import { describe, expect, it } from "vitest";
import { abArm } from "./touches";

// A stable pool of user ids (deterministic — no Math.random so the split
// assertion can't flake).
const USERS = Array.from({ length: 4000 }, (_, i) => `user-${i}-a1b2c3d4e5f6`);

describe("abArm", () => {
  it("is deterministic for a (user, campaign)", () => {
    for (const u of USERS.slice(0, 50)) {
      expect(abArm(u, "team_invite_nudge")).toBe(abArm(u, "team_invite_nudge"));
    }
  });

  it("only ever returns treatment or holdout", () => {
    for (const u of USERS.slice(0, 100)) {
      expect(["treatment", "holdout"]).toContain(abArm(u, "referral_launch"));
    }
  });

  it("splits roughly 50/50 across many users", () => {
    let treatment = 0;
    for (const u of USERS) if (abArm(u, "team_invite_nudge") === "treatment") treatment++;
    const share = treatment / USERS.length;
    // Wide tolerance — this guards against a degenerate hash (all one arm),
    // not statistical precision.
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it("salts by campaign so a user isn't held out of everything at once", () => {
    // For at least some users, the two campaigns should disagree — proof the
    // arm is independent per campaign, not a global per-user coin flip.
    const disagreements = USERS.filter(
      (u) => abArm(u, "team_invite_nudge") !== abArm(u, "referral_launch"),
    ).length;
    expect(disagreements).toBeGreaterThan(USERS.length * 0.3);
  });
});
