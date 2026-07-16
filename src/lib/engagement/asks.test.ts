import { describe, it, expect } from "vitest";
import {
  selectEngagementAsk,
  ENGAGEMENT_ASK_PRIORITY,
  type EngagementAskKind,
} from "./asks";

describe("selectEngagementAsk", () => {
  it("returns null when nothing is eligible", () => {
    expect(selectEngagementAsk([])).toBeNull();
  });

  it("returns the only eligible ask", () => {
    expect(selectEngagementAsk(["rating"])).toBe("rating");
    expect(selectEngagementAsk(["referral_announcement"])).toBe(
      "referral_announcement",
    );
  });

  it("prefers the one-shot referral announcement over the recurring rating ask", () => {
    expect(selectEngagementAsk(["rating", "referral_announcement"])).toBe(
      "referral_announcement",
    );
  });

  it("is order-independent — selection is by priority, not registration", () => {
    expect(selectEngagementAsk(["referral_announcement", "rating"])).toBe(
      selectEngagementAsk(["rating", "referral_announcement"]),
    );
  });

  // The regression this whole arbiter exists to prevent: a coach must never be
  // handed two interruptions from one selection pass.
  it("never returns more than one ask", () => {
    const all: EngagementAskKind[] = ["rating", "referral_announcement"];
    const picked = selectEngagementAsk(all);
    expect(typeof picked).toBe("string");
    expect(all).toContain(picked);
  });

  // The deadlock that killed the previous design: rating deferred to an unseen
  // referral announcement, so a coach the announcement never applied to could
  // never be asked for a rating at all. Selection over a filtered candidate
  // list makes that shape impossible — an ineligible candidate just isn't here.
  it("asks for a rating when the referral announcement is not eligible (no deadlock)", () => {
    expect(selectEngagementAsk(["rating"])).toBe("rating");
  });

  it("has distinct priorities so selection is deterministic", () => {
    const values = Object.values(ENGAGEMENT_ASK_PRIORITY);
    expect(new Set(values).size).toBe(values.length);
  });
});
