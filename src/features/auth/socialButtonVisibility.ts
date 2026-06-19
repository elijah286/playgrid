/**
 * Which social sign-in buttons should render, as a pure decision over the
 * runtime signals AuthFlow has on hand. Extracted from the component so the
 * load-bearing App Store invariant is enforced by a test (see the collocated
 * `.test.ts`) rather than by inline JSX conditions that a refactor could drift.
 *
 * App Store Review Guideline 4.8: an app that offers a third-party login
 * (Google) MUST also offer an equivalent privacy-focused option (Sign in with
 * Apple). On the native iOS shell this is mandatory — the invariant
 *
 *     native && showGoogleButton  ⟹  showAppleButton
 *
 * holds for EVERY input combination (asserted exhaustively in the test). That
 * is what makes a Google-only sign-in screen — the exact 4.8 rejection this
 * fixes — structurally impossible on iOS, regardless of admin toggles.
 */
export type SocialButtonVisibilityInput = {
  /** Running inside the Capacitor native shell (vs. a plain web browser). */
  native: boolean;
  /** Native Sign in with Apple sheet is usable: iOS + the SocialLogin plugin
   *  is registered in the running build. */
  appleNativeUsable: boolean;
  /** Native Google sign-in is usable: client IDs configured + plugin present. */
  googleNativeUsable: boolean;
  /** Admin toggle `site_settings.google_signin_enabled`. */
  googleEnabled: boolean;
};

export type SocialButtonVisibility = {
  showAppleButton: boolean;
  showGoogleButton: boolean;
};

export function computeSocialButtonVisibility(
  input: SocialButtonVisibilityInput,
): SocialButtonVisibility {
  const { native, appleNativeUsable, googleNativeUsable, googleEnabled } = input;

  // Sign in with Apple.
  //  - Native iOS: gated SOLELY by whether the native sheet is usable — NOT by
  //    an admin flag. `apple_signin_enabled` exists only to hide the broken
  //    Supabase *web* Apple provider (it sends the bundle ID com.xogridmaker.app
  //    instead of the Services ID com.xogridmaker.signin, so Apple rejects with
  //    "invalid_request"). The native sheet bypasses that provider entirely
  //    (App ID via signInWithIdToken) and never 400s, so on iOS Apple must not
  //    be gated behind a toggle that defaults off — Guideline 4.8.
  //  - Web / Android: hidden until the web Apple provider Client ID is fixed.
  const showAppleButton = native ? appleNativeUsable : false;

  // Google.
  //  - Native: hide when its own native plugin is unusable (no client ID, or a
  //    build predating the plugin) OR when we cannot show Apple beside it.
  //    Coupling the two means iOS renders {Apple + Google} together or
  //    {neither} — never Google alone (Guideline 4.8).
  //  - Web: just the admin toggle (web is outside App Review scope; the
  //    native binary is what Apple tests).
  const hideGoogleOnNative = native && (!googleNativeUsable || !showAppleButton);
  const showGoogleButton = googleEnabled && !hideGoogleOnNative;

  return { showAppleButton, showGoogleButton };
}
