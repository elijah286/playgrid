import { describe, expect, it } from "vitest";
import { buildRatingPromptNotice } from "./rating-prompt-notice";
import { APP_STORE_REVIEWS_URL, playStoreReviewsUrl } from "@/lib/native/appStore";

describe("buildRatingPromptNotice", () => {
  it("rated (iOS) links to the App Store reviews page — the closest thing to that review", () => {
    const n = buildRatingPromptNotice({
      who: "Marcus",
      outcome: "rated",
      platform: "ios",
      sentiment: "positive",
    });
    expect(n.kind).toBe("review_prompt");
    expect(n.severity).toBe("info");
    expect(n.body).toContain("Marcus");
    expect(n.body).toContain("App Store review");
    expect(n.href).toBe(APP_STORE_REVIEWS_URL);
    expect(n.detail).toMatchObject({ outcome: "rated", platform: "ios" });
  });

  it("rated (Android) links to the Play Store reviews page", () => {
    const n = buildRatingPromptNotice({
      who: "Dana",
      outcome: "rated",
      platform: "android",
      sentiment: "positive",
    });
    expect(n.href).toBe(playStoreReviewsUrl());
  });

  it("dismissed links to the users tab and notes negative sentiment", () => {
    const n = buildRatingPromptNotice({
      who: "Priya",
      outcome: "dismissed",
      platform: "ios",
      sentiment: "negative",
    });
    expect(n.body).toContain("dismissed");
    expect(n.body.toLowerCase()).toContain("wasn");
    expect(n.href).toBe("/settings?tab=users");
    expect(n.detail).toMatchObject({ outcome: "dismissed", sentiment: "negative" });
  });

  it("dismissed with unknown sentiment stays neutral (no parenthetical)", () => {
    const n = buildRatingPromptNotice({
      who: "Sam",
      outcome: "dismissed",
      platform: "android",
    });
    expect(n.body).toBe("Sam saw the rating prompt and dismissed it");
    expect(n.detail).toMatchObject({ sentiment: "unknown" });
  });

  it("falls back to 'Someone' when the who is blank", () => {
    const n = buildRatingPromptNotice({ who: "   ", outcome: "rated", platform: "ios" });
    expect(n.body.startsWith("Someone")).toBe(true);
  });
});
