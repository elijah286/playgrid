/**
 * checkRatingEligibility — the store-review prompt eligibility gate.
 *
 * Regression coverage for the 2026-07-13 fix that turned the prompt on (it had
 * shown to ZERO users): (1) the referral-announcement pre-emption was removed
 * so an unseen announcement no longer permanently blocks reviews, and (2) the
 * "must have a rating trigger" gate was broadened to also accept engaged coaches
 * (≥3 created plays), since the trigger events were sparse/un-backfilled.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const profileMock = vi.fn();
const playCountMock = vi.fn();
const settingMock = vi.fn();

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/site/review-prompt-config", () => ({
  getSuggestReviews: () => settingMock(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => getUserMock() },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: () => profileMock() }) }) };
      }
      if (table === "play_versions") {
        // .select("id",{count,head}).eq("created_by",id).eq("kind","create")
        return { select: () => ({ eq: () => ({ eq: () => playCountMock() }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  })),
}));

import { checkRatingEligibility } from "./rating-prompt";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OLD_CREATED = "2020-01-01T00:00:00.000Z"; // well past the 7-day age gate

function profile(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      role: "user",
      created_at: OLD_CREATED,
      rating_triggers_fired: [],
      rating_prompt_shown_at: null,
      last_engagement_prompt_at: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  profileMock.mockReset();
  playCountMock.mockReset();
  settingMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
  settingMock.mockResolvedValue("everyone");
});

describe("checkRatingEligibility", () => {
  it("qualifies an engaged coach (≥3 plays) with NO rating trigger", async () => {
    profileMock.mockResolvedValue(profile({ rating_triggers_fired: [] }));
    playCountMock.mockResolvedValue({ count: 5 });
    expect(await checkRatingEligibility()).toBe(true);
  });

  it("rejects a coach with no trigger and fewer than 3 plays", async () => {
    profileMock.mockResolvedValue(profile({ rating_triggers_fired: [] }));
    playCountMock.mockResolvedValue({ count: 2 });
    expect(await checkRatingEligibility()).toBe(false);
  });

  it("qualifies on an explicit trigger without querying play count", async () => {
    profileMock.mockResolvedValue(profile({ rating_triggers_fired: ["third_play"] }));
    // If this were consulted the test would still pass true, so assert it wasn't called.
    playCountMock.mockRejectedValue(new Error("play_versions should not be queried"));
    expect(await checkRatingEligibility()).toBe(true);
    expect(playCountMock).not.toHaveBeenCalled();
  });

  it("no longer blocks on an unseen referral announcement (the deadlock)", async () => {
    // referral_announcement_seen_at is intentionally absent; pre-fix this path
    // returned false via isReferralAnnouncementOwed. Now only the 14-day
    // cooldown de-dupes, which is null here → eligible.
    profileMock.mockResolvedValue(profile({ rating_triggers_fired: ["cal_save"] }));
    expect(await checkRatingEligibility()).toBe(true);
  });

  it("still respects the shared 14-day engagement cooldown", async () => {
    profileMock.mockResolvedValue(
      profile({
        rating_triggers_fired: ["third_play"],
        last_engagement_prompt_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      }),
    );
    expect(await checkRatingEligibility()).toBe(false);
  });

  it("respects suggest_reviews='off'", async () => {
    settingMock.mockResolvedValue("off");
    profileMock.mockResolvedValue(profile({ rating_triggers_fired: ["third_play"] }));
    expect(await checkRatingEligibility()).toBe(false);
  });
});
