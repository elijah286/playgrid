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
        for (const appleEnabled of bools)
          for (const googleEnabled of bools)
            out.push({
              native,
              appleNativeUsable,
              googleNativeUsable,
              appleEnabled,
              googleEnabled,
            });
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

  // The admin toggle gates web only. If it could hide Apple on native, an admin
  // switching it off would recreate the Google-only iOS screen 4.8 rejects.
  it("shows Apple on native whenever the native sheet is usable, even with the admin toggle off", () => {
    const { showAppleButton } = computeSocialButtonVisibility({
      native: true,
      appleNativeUsable: true,
      googleNativeUsable: false,
      appleEnabled: false,
      googleEnabled: false,
    });
    expect(showAppleButton).toBe(true);
  });

  it("hides Apple on native when the native sheet is unusable (older build w/o plugin)", () => {
    const { showAppleButton, showGoogleButton } = computeSocialButtonVisibility({
      native: true,
      appleNativeUsable: false,
      googleNativeUsable: true,
      appleEnabled: true,
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
      appleEnabled: true,
      googleEnabled: true,
    });
    expect(showAppleButton).toBe(true);
    expect(showGoogleButton).toBe(true);
  });

  // Web Apple rides the admin toggle: the Supabase Client IDs list now leads
  // with the Services ID, so the web OAuth redirect no longer 400s and the
  // button is safe to render off the flag alone.
  it("shows Apple on web when the admin toggle is on, and hides it when off", () => {
    const base = {
      native: false,
      appleNativeUsable: true,
      googleNativeUsable: true,
      googleEnabled: true,
    } as const;

    expect(
      computeSocialButtonVisibility({ ...base, appleEnabled: true }).showAppleButton,
    ).toBe(true);
    expect(
      computeSocialButtonVisibility({ ...base, appleEnabled: false }).showAppleButton,
    ).toBe(false);
  });

  it("does not couple Apple and Google on web — each follows its own toggle", () => {
    // Unlike native, a Google-only row is fine on web: App Review only tests
    // the native binary, so the 4.8 coupling would be a needless restriction.
    const googleOnly = computeSocialButtonVisibility({
      native: false,
      appleNativeUsable: true,
      googleNativeUsable: true,
      appleEnabled: false,
      googleEnabled: true,
    });
    expect(googleOnly.showAppleButton).toBe(false);
    expect(googleOnly.showGoogleButton).toBe(true);

    const appleOnly = computeSocialButtonVisibility({
      native: false,
      appleNativeUsable: true,
      googleNativeUsable: true,
      appleEnabled: true,
      googleEnabled: false,
    });
    expect(appleOnly.showAppleButton).toBe(true);
    expect(appleOnly.showGoogleButton).toBe(false);
  });

  // Web Apple does not depend on the native plugin being present — the web
  // branch must never consult appleNativeUsable.
  it("shows Apple on web even when the native sheet is unusable", () => {
    const { showAppleButton } = computeSocialButtonVisibility({
      native: false,
      appleNativeUsable: false,
      googleNativeUsable: false,
      appleEnabled: true,
      googleEnabled: false,
    });
    expect(showAppleButton).toBe(true);
  });
});
