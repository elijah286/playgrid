import { afterEach, describe, expect, it, vi } from "vitest";

const active = vi.fn();
vi.mock("@/lib/site/referral-config", () => ({
  getReferralConfig: () => Promise.resolve({ enabled: false, testEmails: [] }),
  isReferralActiveForUser: (...a: unknown[]) => active(...a),
}));

import {
  ENGAGEMENT_PROMPT_COOLDOWN_DAYS,
  REFERRAL_ANNOUNCEMENT_MIN_ACCOUNT_AGE_DAYS,
  accountEligibleForReferralAnnouncement,
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

describe("accountEligibleForReferralAnnouncement (day-0 guard)", () => {
  const now = Date.now();
  it("brand-new / unknown-age account → held back", () => {
    expect(accountEligibleForReferralAnnouncement(null, now)).toBe(false);
    expect(accountEligibleForReferralAnnouncement(undefined, now)).toBe(false);
    expect(accountEligibleForReferralAnnouncement("not-a-date", now)).toBe(false);
    // Just signed up seconds ago.
    expect(
      accountEligibleForReferralAnnouncement(new Date(now - 30_000).toISOString(), now),
    ).toBe(false);
  });
  it("younger than the floor → held back", () => {
    const almost = now - (REFERRAL_ANNOUNCEMENT_MIN_ACCOUNT_AGE_DAYS * 86400000 - 60_000);
    expect(
      accountEligibleForReferralAnnouncement(new Date(almost).toISOString(), now),
    ).toBe(false);
  });
  it("at or past the floor → eligible", () => {
    const floorMs = REFERRAL_ANNOUNCEMENT_MIN_ACCOUNT_AGE_DAYS * 86400000;
    expect(
      accountEligibleForReferralAnnouncement(new Date(now - floorMs).toISOString(), now),
    ).toBe(true);
    expect(
      accountEligibleForReferralAnnouncement(new Date(now - 30 * 86400000).toISOString(), now),
    ).toBe(true);
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
