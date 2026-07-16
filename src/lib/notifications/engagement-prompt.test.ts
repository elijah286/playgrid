import { describe, expect, it } from "vitest";
import {
  REFERRAL_ANNOUNCEMENT_MIN_ACCOUNT_AGE_DAYS,
  accountEligibleForReferralAnnouncement,
} from "./engagement-prompt";

// The shared-cooldown tests moved to src/lib/engagement/claim.test.ts, which is
// where the cooldown now lives — as a predicate inside the atomic claim rather
// than a read each caller performs before writing.

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
