import { describe, expect, it } from "vitest";
import {
  computeSocialButtonVisibility,
  type SocialButtonVisibilityInput,
} from "./socialButtonVisibility";

/** Every combination of the four boolean inputs. */
function allInputs(): SocialButtonVisibilityInput[] {
  const bools = [false, true];
  const out: SocialButtonVisibilityInput[] = [];
  for (const native of bools)
    for (const appleNativeUsable of bools)
      for (const googleNativeUsable of bools)
        for (const googleEnabled of bools)
          out.push({ native, appleNativeUsable, googleNativeUsable, googleEnabled });
  return out;
}

describe("computeSocialButtonVisibility", () => {
  // The whole reason this helper exists: on iOS, Google may never render
  // without Apple beside it. This is the App Store Guideline 4.8 invariant and
  // the regression guard for the Google-only sign-in screen that got rejected.
  it("never shows Google without Apple on native (Guideline 4.8) — exhaustive", () => {
    for (const input of allInputs()) {
      const { showAppleButton, showGoogleButton } = computeSocialButtonVisibility(input);
      if (input.native && showGoogleButton) {
        expect(
          showAppleButton,
          `Google rendered without Apple on native for ${JSON.stringify(input)}`,
        ).toBe(true);
      }
    }
  });

  it("shows Apple on native whenever the native sheet is usable, regardless of admin toggles", () => {
    const { showAppleButton } = computeSocialButtonVisibility({
      native: true,
      appleNativeUsable: true,
      googleNativeUsable: false,
      googleEnabled: false,
    });
    expect(showAppleButton).toBe(true);
  });

  it("hides Apple on native when the native sheet is unusable (older build w/o plugin)", () => {
    const { showAppleButton, showGoogleButton } = computeSocialButtonVisibility({
      native: true,
      appleNativeUsable: false,
      googleNativeUsable: true,
      googleEnabled: true,
    });
    expect(showAppleButton).toBe(false);
    // ...and Google must therefore also hide — no Google-only row on iOS.
    expect(showGoogleButton).toBe(false);
  });

  it("shows both when both native providers are usable and Google is enabled", () => {
    const { showAppleButton, showGoogleButton } = computeSocialButtonVisibility({
      native: true,
      appleNativeUsable: true,
      googleNativeUsable: true,
      googleEnabled: true,
    });
    expect(showAppleButton).toBe(true);
    expect(showGoogleButton).toBe(true);
  });

  it("keeps Apple hidden on web (broken Supabase web provider) and lets Google follow its admin toggle", () => {
    const enabled = computeSocialButtonVisibility({
      native: false,
      appleNativeUsable: true,
      googleNativeUsable: true,
      googleEnabled: true,
    });
    expect(enabled.showAppleButton).toBe(false);
    expect(enabled.showGoogleButton).toBe(true);

    const disabled = computeSocialButtonVisibility({
      native: false,
      appleNativeUsable: true,
      googleNativeUsable: true,
      googleEnabled: false,
    });
    expect(disabled.showGoogleButton).toBe(false);
  });
});
