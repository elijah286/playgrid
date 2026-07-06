import { afterEach, describe, expect, it, vi } from "vitest";

const active = vi.fn();
vi.mock("@/lib/site/referral-config", () => ({
  getReferralConfig: () => Promise.resolve({ enabled: false, testEmails: [] }),
  isReferralActiveForUser: (...a: unknown[]) => active(...a),
}));

import {
  ENGAGEMENT_PROMPT_COOLDOWN_DAYS,
  isReferralAnnouncementOwed,
  isWithinEngagementCooldown,
} from "./engagement-prompt";

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString();

describe("isWithinEngagementCooldown", () => {
  it("null → not in cooldown (never prompted)", () => {
    expect(isWithinEngagementCooldown(null)).toBe(false);
    expect(isWithinEngagementCooldown(undefined)).toBe(false);
  });
  it("recent prompt → in cooldown", () => {
    expect(isWithinEngagementCooldown(daysAgo(1))).toBe(true);
    expect(isWithinEngagementCooldown(daysAgo(ENGAGEMENT_PROMPT_COOLDOWN_DAYS - 1))).toBe(true);
  });
  it("older than the window → not in cooldown", () => {
    expect(isWithinEngagementCooldown(daysAgo(ENGAGEMENT_PROMPT_COOLDOWN_DAYS + 1))).toBe(false);
    expect(isWithinEngagementCooldown(daysAgo(365))).toBe(false);
  });
});

describe("isReferralAnnouncementOwed", () => {
  afterEach(() => active.mockReset());

  it("already seen → not owed (regardless of active)", async () => {
    active.mockResolvedValue(true);
    expect(await isReferralAnnouncementOwed("u1", daysAgo(3))).toBe(false);
    expect(active).not.toHaveBeenCalled();
  });
  it("never seen + program active for user → owed", async () => {
    active.mockResolvedValue(true);
    expect(await isReferralAnnouncementOwed("u1", null)).toBe(true);
  });
  it("never seen + program inactive for user → not owed", async () => {
    active.mockResolvedValue(false);
    expect(await isReferralAnnouncementOwed("u1", null)).toBe(false);
  });
});
