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
 *
 * Note the asymmetry: on web the Apple button follows its admin toggle, but on
 * native it deliberately does not. An admin switching Apple off must not be
 * able to produce a Google-only iOS screen — hence the toggle is consulted on
 * the web branch only.
 */
export type SocialButtonVisibilityInput = {
  /** Running inside the Capacitor native shell (vs. a plain web browser). */
  native: boolean;
  /** Native Sign in with Apple sheet is usable: iOS + the SocialLogin plugin
   *  is registered in the running build. */
  appleNativeUsable: boolean;
  /** Native Google sign-in is usable: client IDs configured + plugin present. */
  googleNativeUsable: boolean;
  /** Admin toggle `site_settings.apple_signin_enabled`. Gates the web Apple
   *  button only — never the native sheet (see below). */
  appleEnabled: boolean;
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
  const { native, appleNativeUsable, googleNativeUsable, appleEnabled, googleEnabled } =
    input;

  // Sign in with Apple.
  //  - Native iOS: gated SOLELY by whether the native sheet is usable — NOT by
  //    the admin flag. The native sheet authenticates against the App ID via
  //    signInWithIdToken and bypasses the web provider entirely, so it must not
  //    be gated behind a toggle an admin could switch off — Guideline 4.8
  //    requires Apple to render wherever Google does.
  //  - Web / Android: the admin toggle. Web Apple was hard-disabled here from
  //    2026-06-11 to 2026-07-16 because Supabase sent the bundle ID
  //    com.xogridmaker.app as the OAuth client_id instead of the Services ID
  //    com.xogridmaker.signin, and Apple rejected it with "invalid_request".
  //    Supabase uses the FIRST id in its Client IDs list for the web flow and
  //    accepts any of them as a native token audience, so ordering that list
  //    "com.xogridmaker.signin,com.xogridmaker.app" fixes web without touching
  //    native. That's config, not code — if web Apple regresses, re-check that
  //    ordering before touching this line.
  const showAppleButton = native ? appleNativeUsable : appleEnabled;

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
