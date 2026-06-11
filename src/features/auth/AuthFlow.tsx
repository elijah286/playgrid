"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { emailHasAccountAction } from "@/app/actions/auth-lookup";
import { afterSignupSyncRoleAction } from "@/app/actions/coach-invitations";
import {
  runSignupAttributionAction,
  updateDisplayNameAction,
} from "@/app/actions/account";
import { Button, Input, useToast } from "@/components/ui";
import { PASSWORD_RULES_LABEL, validatePassword } from "@/lib/auth/password";
import { suggestEmailDomainCorrection } from "@/lib/auth/email-typo";
import { track } from "@/lib/analytics/track";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import {
  canUseNativeGoogleAuth,
  signInWithGoogleNative,
} from "@/lib/native/googleAuth";
import {
  canUseNativeAppleAuth,
  signInWithAppleNative,
} from "@/lib/native/appleAuth";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.32z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleGlyph({ className }: { className?: string }) {
  // The Apple mark is a solid shape, so it reads visually heavier than the
  // thin multi-color Google "G" at the same box size — and the raw path only
  // fills ~92% of a 0 0 24 24 viewBox, leaving it rendering noticeably smaller
  // than the Google glyph. This viewBox is the apple's bounding box expanded
  // into a centered square so that inside a size-4 (16px) box the glyph renders
  // ~15.5px optical, matching the Google glyph's apparent size.
  return (
    <svg
      className={className}
      viewBox="0.58 0.65 22.71 22.71"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.46z" />
    </svg>
  );
}

/**
 * A single unified sign-in / sign-up flow. Email first; the form branches
 * on whether that email already has an account. Code is the universal
 * fallback (bad password, forgot password, first-time signup) so there is
 * only ever one "what do I do now?" answer.
 */
export type AuthFlowProps = {
  /** Where to send the user after success. Defaults to /home. */
  next?: string;
  /** Optional heading copy shown above the form (e.g. invite context). */
  heading?: string;
  /** Optional subheading copy (e.g. "to join the 2026 playbook"). */
  subheading?: string;
  /** Hidden invite code to pass through the signup metadata. */
  inviteCode?: string;
  /** Notifies the parent whenever the internal step changes. Used by the
   *  login page to swap the big heading between "Get started" and
   *  "Welcome back" depending on whether the entered email already has an
   *  account. */
  onStepChange?: (step: Step) => void;
  /** Site-admin OAuth provider toggles. Hidden when false so we never
   *  surface a button that 400s because the provider isn't configured. */
  appleEnabled?: boolean;
  googleEnabled?: boolean;
  /** Google OAuth Web Client ID from site_settings. Required for the
   *  native Google sign-in flow on Android/iOS — when null/empty the
   *  Google button is hidden inside the Capacitor wrapper. Web sign-in
   *  flow ignores this value (goes through Supabase-hosted OAuth). */
  googleOAuthWebClientId?: string | null;
  /** Google OAuth **iOS** Client ID from site_settings. Required (on top of
   *  the web client ID) for native Google sign-in on iOS — when null/empty
   *  the Google button is hidden on iOS. Android ignores it. */
  googleOAuthIosClientId?: string | null;
};

export type Step =
  | "email"
  | "password"
  | "code"
  | "new-user-profile"
  | "offer-reset"
  | "set-new-password";

const RESEND_COOLDOWN_SECONDS = 30;

function isInvalidCredentials(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("invalid login credentials") ||
    m.includes("invalid email or password") ||
    m.includes("invalid_grant")
  );
}

export function AuthFlow({
  next,
  heading,
  subheading,
  inviteCode,
  onStepChange,
  appleEnabled = false,
  googleEnabled = false,
  googleOAuthWebClientId = null,
  googleOAuthIosClientId = null,
}: AuthFlowProps) {
  const { toast } = useToast();

  // Hide the Google button on native when the plugin isn't usable
  // (no client ID configured in Site Admin, or the installed APK
  // predates the plugin). On web the button always falls back to the
  // Supabase-hosted OAuth flow.
  const native = useIsNativeApp();
  const hideGoogleOnNative =
    native &&
    !canUseNativeGoogleAuth(googleOAuthWebClientId, googleOAuthIosClientId);

  // Apple button visibility:
  //  - Web (and any non-native browser, incl. Windows/Android laptops):
  //    always show when enabled — uses Supabase-hosted Apple OAuth.
  //  - iOS native: show only when the SocialLogin plugin is registered in
  //    the running build (older builds predate it), so we use the native
  //    Sign in with Apple sheet instead of a broken web redirect.
  //  - Android native: hidden (those users have Google + email).
  const appleNativeUsable = canUseNativeAppleAuth();
  const showAppleButton = appleEnabled && (!native || appleNativeUsable);

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const [pending, setPending] = useState(false);
  // Synchronous guard against concurrent submits. React state updates are
  // batched and async — a fast double-click can fire two submits before
  // `pending` flips to true. The ref flips synchronously so the second entry
  // bails out immediately.
  const submittingRef = useRef(false);
  const [badPassword, setBadPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Cleared on any form edit so stale errors don't linger.
  const clearErrors = useCallback(() => {
    setBadPassword(false);
    setFormError(null);
  }, []);

  // Resend cooldown tick.
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const startCooldown = useCallback(() => {
    setResendCountdown(RESEND_COOLDOWN_SECONDS);
  }, []);

  // Autofocus the first field whenever the step changes, so keyboard users
  // don't have to click back into the form.
  const stepRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stepRootRef.current?.querySelector<HTMLInputElement>("input:not([disabled])");
    el?.focus();
  }, [step]);

  // ---------- Effects: step transitions ----------

  async function signInWithOAuthProvider(provider: "apple" | "google", label: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    clearErrors();
    track({ event: "auth_oauth_started", target: provider });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        },
      });
      if (error) throw error;
      // signInWithOAuth navigates the page; nothing more to do here.
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : `Could not start ${label} sign-in.`);
      setPending(false);
      submittingRef.current = false;
    }
  }

  // Native Google sign-in: skips the OAuth redirect (WebViews can't load
  // Google's auth pages) and uses the system Google SDK to fetch an ID
  // token, then hands it to Supabase. We replicate the side-effects the
  // /auth/callback route runs server-side for web OAuth (first-touch
  // attribution snapshot + Reddit signup pixel marker) so the native
  // flow ends up in the same state as a successful web OAuth.
  async function signInWithGoogleOnNative() {
    if (submittingRef.current) return;
    if (!googleOAuthWebClientId) {
      setFormError("Google sign-in is not configured for the app.");
      return;
    }
    submittingRef.current = true;
    setPending(true);
    clearErrors();
    track({ event: "auth_oauth_started", target: "google" });
    try {
      const supabase = createClient();
      const { isFreshSignup } = await signInWithGoogleNative(
        supabase,
        googleOAuthWebClientId,
        googleOAuthIosClientId,
      );

      if (inviteCode) {
        await afterSignupSyncRoleAction();
      }
      // Fire-and-forget — action is idempotent and self-gated.
      void runSignupAttributionAction();

      track({ event: "auth_oauth_success", target: "google" });
      hardNavigate(isFreshSignup ? withSignupMarkers(safeNext) : safeNext);
      return; // keep pending true through navigation
    } catch (e: unknown) {
      // capgo plugin rejects with code USER_CANCELLED when the user
      // dismisses the Google account picker. Don't surface an error for
      // intentional cancellation — just reset the button state.
      const code = (e as { code?: string } | null)?.code;
      if (code !== "USER_CANCELLED") {
        setFormError(
          e instanceof Error ? e.message : "Could not start Google sign-in.",
        );
      }
      setPending(false);
      submittingRef.current = false;
    }
  }

  // Native Sign in with Apple: uses the iOS system sheet via the
  // SocialLogin plugin (ASAuthorization) instead of the web redirect, then
  // hands the identity token to Supabase. Replicates the same post-signup
  // side-effects the /auth/callback route runs for web OAuth (first-touch
  // attribution + Reddit signup pixel) so the native flow ends in the same
  // state as a successful web OAuth — mirrors signInWithGoogleOnNative.
  async function signInWithAppleOnNative() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    clearErrors();
    track({ event: "auth_oauth_started", target: "apple" });
    try {
      const supabase = createClient();
      const { isFreshSignup } = await signInWithAppleNative(supabase);

      if (inviteCode) {
        await afterSignupSyncRoleAction();
      }
      // Fire-and-forget — action is idempotent and self-gated.
      void runSignupAttributionAction();

      track({ event: "auth_oauth_success", target: "apple" });
      hardNavigate(isFreshSignup ? withSignupMarkers(safeNext) : safeNext);
      return; // keep pending true through navigation
    } catch (e: unknown) {
      // The plugin rejects when the user dismisses the Apple sheet. A clean
      // cancellation (code 1001 / USER_CANCELLED) just resets the button.
      const code = (e as { code?: string } | null)?.code;
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      const cancelled =
        code === "USER_CANCELLED" ||
        code === "1001" ||
        msg.includes("error 1001") ||
        msg.includes("canceled") ||
        msg.includes("cancelled");
      if (!cancelled) {
        // Other ASAuthorization failures — notably error 1000 ("unknown"),
        // which fires when no iCloud account is signed in on the device —
        // shouldn't dump a raw native error string at the coach. Show a
        // friendly note that points at the likely cause and alternatives.
        const isNativeAppleError =
          msg.includes("authorizationerror") ||
          msg.includes("authenticationservices");
        setFormError(
          isNativeAppleError
            ? "Apple sign-in couldn't be completed — make sure you're signed in to iCloud on this device, or continue with Google or email."
            : e instanceof Error
              ? e.message
              : "Could not start Apple sign-in.",
        );
      }
      setPending(false);
      submittingRef.current = false;
    }
  }

  const signInWithApple = () =>
    canUseNativeAppleAuth()
      ? signInWithAppleOnNative()
      : signInWithOAuthProvider("apple", "Apple");
  const signInWithGoogle = () =>
    isNativeApp()
      ? signInWithGoogleOnNative()
      : signInWithOAuthProvider("google", "Google");

  async function submitEmail() {
    if (!hasSupabaseEnv()) {
      setFormError("Supabase is not configured.");
      return;
    }
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setFormError("Enter a valid email.");
      return;
    }
    setPending(true);
    clearErrors();
    track({ event: "auth_email_submitted" });
    try {
      const res = await emailHasAccountAction(trimmed);
      if (!res.ok) throw new Error(res.error);
      if (res.exists) {
        // Existing accounts always land on the password step. OTP-only
        // users can fall through via the "Use a one-time passcode instead"
        // link under the password input.
        track({ event: "auth_email_known", metadata: { branch: "password" } });
        setStep("password");
      } else {
        track({ event: "auth_email_new", metadata: { branch: "code" } });
        await sendCode({ isNewUser: true, silent: true });
        setStep("code");
      }
    } catch (e: unknown) {
      track({ event: "auth_email_error" });
      setFormError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function submitPassword() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    clearErrors();
    track({ event: "auth_password_attempt" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      track({ event: "auth_password_success" });
      window.location.assign(safeNext);
      return; // keep pending=true through navigation so the button stays in its loading state
    } catch (e: unknown) {
      if (isInvalidCredentials(e)) {
        track({ event: "auth_password_invalid" });
        setBadPassword(true);
      } else {
        setFormError(e instanceof Error ? e.message : "Sign-in failed.");
      }
      submittingRef.current = false;
      setPending(false);
    }
  }

  async function sendCode({
    isNewUser,
    silent = false,
  }: {
    isNewUser: boolean;
    silent?: boolean;
  }) {
    if (resendCountdown > 0) return;
    setPending(true);
    clearErrors();
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: isNewUser,
          data: inviteCode ? { invite_code: inviteCode } : undefined,
        },
      });
      if (error) throw error;
      startCooldown();
      if (!silent) toast("Code sent. Check your email.", "success");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not send code.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode({ cameFromForgot }: { cameFromForgot: boolean }) {
    if (code.trim().length !== 6) {
      setFormError("Enter the 6-digit code from your email.");
      return;
    }
    setPending(true);
    clearErrors();
    track({ event: "auth_code_attempt" });
    try {
      const supabase = createClient();
      const { error, data } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;

      // Stamp first-touch attribution onto the new profile. The OAuth
      // callback handles this for Apple/Google flows, but email-OTP
      // signups never hit that route, so without this the
      // pg_first_touch cookie is lost and the admin Users tab shows
      // "Unknown" for everyone who signed up by email code. Fire-and-
      // forget — the action is idempotent and gates itself with a
      // 5-minute grace window so returning users don't trigger writes.
      if (data.session) {
        void runSignupAttributionAction();
      }

      // Sync coach role if an invite code was carried through signup.
      if (inviteCode && data.session) {
        await afterSignupSyncRoleAction();
      }

      // Branch on whether this is a brand-new account (no display_name yet
      // and created within the last minute) vs an existing user who asked
      // for a code. Simpler proxy: check user_metadata.display_name.
      const user = data.user;
      const hasProfile = Boolean(
        (user?.user_metadata as Record<string, unknown> | undefined)?.display_name,
      );
      // Treat "created within last 5 min" as a fresh signup so we collect
      // name + password. Otherwise this is a returning user using a code.
      const createdAt = user?.created_at ? new Date(user.created_at).getTime() : 0;
      const justCreated = Date.now() - createdAt < 5 * 60_000;

      if (!hasProfile && justCreated) {
        track({ event: "auth_code_success", metadata: { branch: "new-user-profile" } });
        setStep("new-user-profile");
      } else if (cameFromForgot) {
        track({ event: "auth_code_success", metadata: { branch: "set-new-password" } });
        setStep("set-new-password");
      } else {
        track({ event: "auth_code_success", metadata: { branch: "offer-reset" } });
        setStep("offer-reset");
      }
    } catch (e: unknown) {
      track({ event: "auth_code_invalid" });
      setFormError(e instanceof Error ? e.message : "That code didn't work. Try again.");
    } finally {
      setPending(false);
    }
  }

  // Supabase rejects `updateUser({ password })` with "New password should be
  // different from the old password" when the submitted password matches the
  // one already on file. That happens if the user double-clicks "Create
  // account" — the first call succeeded, the second hits this guard. Treat it
  // as a no-op success so the user isn't confused by a red error after their
  // account is already set up.
  function isSamePasswordErr(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const m = err.message.toLowerCase();
    return m.includes("should be different from the old password");
  }

  // Hard browser navigation. Fresh HTTP request means the new auth cookies
  // from updateUser/verifyOtp are sent to middleware on the very next request,
  // so we never get redirected back to /login by the default-deny middleware.
  // `router.push` keeps the existing client runtime which sometimes misses
  // the cookie update.
  function hardNavigate(to: string) {
    window.location.assign(to);
  }

  // Tack the ad-pixel signup markers onto a path so RedditPixel and MetaPixel
  // fire their conversion events (SignUp / CompleteRegistration) on the next
  // page load. Mirrors the markers the /auth/callback route adds after OAuth.
  // Each pixel reads + strips its own distinct marker, so they're independent.
  function withSignupMarkers(to: string): string {
    try {
      const u = new URL(to, window.location.origin);
      u.searchParams.set("rdt_signup", "1");
      u.searchParams.set("fbq_signup", "1");
      return u.pathname + u.search + u.hash;
    } catch {
      const sep = to.includes("?") ? "&" : "?";
      return `${to}${sep}rdt_signup=1&fbq_signup=1`;
    }
  }

  async function completeNewUserProfile() {
    if (submittingRef.current) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setFormError("Enter your name.");
      return;
    }
    const pwErr = validatePassword(newPassword);
    if (pwErr) {
      setFormError(pwErr);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setFormError("Passwords do not match.");
      return;
    }
    submittingRef.current = true;
    setPending(true);
    clearErrors();
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { display_name: trimmedName },
      });
      if (error && !isSamePasswordErr(error)) throw error;
      // Auth metadata isn't synced to profiles.display_name by any
      // existing trigger — handle_new_user reads at INSERT time, but
      // this update happens after signup. Persist directly so the new
      // user shows up by name (not email) in rosters and shares.
      await updateDisplayNameAction({ displayName: trimmedName }).catch(() => {
        // Non-fatal: auth signup already succeeded. Worst case the
        // user appears by email until they edit their account.
      });
      toast("Welcome to XO Gridmaker!", "success");
      track({ event: "auth_signup_completed", metadata: { method: "email_otp" } });
      // Fresh signup — append the marker so RedditPixel fires SignUp on
      // the next page load. The OAuth callback adds this marker
      // server-side; the email-OTP path adds it here.
      hardNavigate(withSignupMarkers(safeNext));
      return; // keep pending=true through navigation to block double-clicks
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not finish sign-up.");
      setPending(false);
      submittingRef.current = false;
    }
  }

  async function setNewPasswordSubmit() {
    if (submittingRef.current) return;
    const pwErr = validatePassword(newPassword);
    if (pwErr) {
      setFormError(pwErr);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setFormError("Passwords do not match.");
      return;
    }
    submittingRef.current = true;
    setPending(true);
    clearErrors();
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error && !isSamePasswordErr(error)) throw error;
      toast("Password updated.", "success");
      hardNavigate(safeNext);
      return; // keep pending=true through navigation to block double-clicks
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not update password.");
      setPending(false);
      submittingRef.current = false;
    }
  }

  function continueWithoutReset() {
    window.location.assign(safeNext);
  }

  function handleForgot() {
    void sendCode({ isNewUser: false });
    setStep("code");
  }

  function handleBadPasswordCode() {
    setBadPassword(false);
    void sendCode({ isNewUser: false });
    setStep("code");
  }

  // ---------- Form submit routing ----------

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || submittingRef.current) return;
    if (step === "email") return void submitEmail();
    if (step === "password") return void submitPassword();
    if (step === "code") return void verifyCode({ cameFromForgot: false });
    if (step === "new-user-profile") return void completeNewUserProfile();
    if (step === "set-new-password") return void setNewPasswordSubmit();
  }

  // ---------- Per-step UI ----------

  const primaryLabel = pending
    ? step === "email"
      ? "Checking…"
      : step === "password"
        ? "Signing in…"
        : step === "code"
          ? "Verifying…"
          : step === "new-user-profile"
            ? "Creating account…"
            : step === "set-new-password"
              ? "Updating password…"
              : "Loading…"
    : step === "email"
      ? "Continue"
      : step === "password"
        ? "Sign in"
        : step === "code"
          ? "Verify code"
          : step === "new-user-profile"
            ? "Create account"
            : step === "set-new-password"
              ? "Update password"
              : "Continue";

  if (!hasSupabaseEnv()) {
    return (
      <div className="rounded-lg border border-warning bg-warning-light p-4 text-sm text-warning">
        Add NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.
      </div>
    );
  }

  return (
    <div ref={stepRootRef} className="space-y-4">
      {(heading || subheading) && (
        <div>
          {heading && <h2 className="text-base font-semibold text-foreground">{heading}</h2>}
          {subheading && <p className="mt-0.5 text-xs text-muted">{subheading}</p>}
        </div>
      )}

      {step === "offer-reset" ? (
        <OfferResetStep
          onReset={() => setStep("set-new-password")}
          onSkip={continueWithoutReset}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {/* Social sign-in. Each provider is controlled by a Site Admin
              toggle (site_settings.{apple,google}_signin_enabled) so we
              never surface a button that 400s when the provider isn't
              configured in Supabase. Apple is required by App Store Review
              Guideline 4.8 once the iOS app ships, so flip it back on then. */}
          {step === "email" && (showAppleButton || googleEnabled) && (
            <>
              {googleEnabled && !hideGoogleOnNative && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void signInWithGoogle()}
                  disabled={pending}
                >
                  <GoogleGlyph className="mr-2 size-4" aria-hidden />
                  Continue with Google
                </Button>
              )}
              {showAppleButton && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void signInWithApple()}
                  disabled={pending}
                >
                  <AppleGlyph className="mr-2 size-4" aria-hidden />
                  Continue with Apple
                </Button>
              )}
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span>or</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
            </>
          )}

          {/* Email — shown on every step except new-user-profile where it's implicit */}
          {step !== "new-user-profile" && step !== "set-new-password" && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-foreground">Email</span>
              <Input
                type="email"
                autoComplete="email"
                leftIcon={Mail}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearErrors();
                }}
                disabled={step !== "email"}
                required
              />
              {step === "email" && (() => {
                const suggested = suggestEmailDomainCorrection(email);
                if (!suggested) return null;
                return (
                  <p className="mt-1.5 text-xs text-muted">
                    Did you mean{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(suggested);
                        clearErrors();
                      }}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {suggested}
                    </button>
                    ?
                  </p>
                );
              })()}
            </label>
          )}

          {step === "password" && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-foreground">Password</span>
              <Input
                type="password"
                autoComplete="current-password"
                leftIcon={Lock}
                placeholder="Your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearErrors();
                }}
                required
              />
            </label>
          )}

          {step === "code" && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-foreground">6-digit code</span>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  clearErrors();
                }}
                className="font-mono tracking-[0.3em]"
                required
              />
              <p className="mt-1 text-xs text-muted">
                Sent to <span className="font-medium text-foreground">{email}</span>.{" "}
                {resendCountdown > 0 ? (
                  <span>Resend in {resendCountdown}s</span>
                ) : (
                  <button
                    type="button"
                    className="font-medium text-primary hover:text-primary-hover disabled:opacity-50"
                    onClick={() => void sendCode({ isNewUser: false })}
                    disabled={pending}
                  >
                    Resend code
                  </button>
                )}
              </p>
            </label>
          )}

          {step === "new-user-profile" && (
            <>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-foreground">Your name</span>
                <Input
                  type="text"
                  autoComplete="name"
                  leftIcon={User}
                  placeholder="Alex Rodriguez"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearErrors();
                  }}
                  required
                />
              </label>
              <PasswordFields
                password={newPassword}
                onPasswordChange={(v) => {
                  setNewPassword(v);
                  clearErrors();
                }}
                confirm={newPasswordConfirm}
                onConfirmChange={(v) => {
                  setNewPasswordConfirm(v);
                  clearErrors();
                }}
              />
            </>
          )}

          {step === "set-new-password" && (
            <PasswordFields
              password={newPassword}
              onPasswordChange={(v) => {
                setNewPassword(v);
                clearErrors();
              }}
              confirm={newPasswordConfirm}
              onConfirmChange={(v) => {
                setNewPasswordConfirm(v);
                clearErrors();
              }}
            />
          )}

          {/* Bad-password inline recovery block */}
          {badPassword && step === "password" && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm">
              <p className="font-medium text-danger">
                That password didn&rsquo;t match our records.
              </p>
              <p className="mt-1 text-xs text-muted">
                Try again, or email yourself a code to sign in.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleBadPasswordCode}
                  disabled={pending}
                  className="text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-50"
                >
                  Email me a 6-digit code
                </button>
              </div>
            </div>
          )}

          {formError && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" className="w-full" loading={pending}>
            {primaryLabel}
          </Button>

          {/* Contextual helper under the primary button */}
          {step === "password" && (
            <button
              type="button"
              onClick={handleForgot}
              disabled={pending}
              className="block w-full text-center text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              Use a one-time passcode instead
            </button>
          )}

          {(step === "code" || step === "password") && (
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setPassword("");
                clearErrors();
              }}
              disabled={pending}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="size-3" /> Use a different email
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function PasswordFields({
  password,
  onPasswordChange,
  confirm,
  onConfirmChange,
}: {
  password: string;
  onPasswordChange: (v: string) => void;
  confirm: string;
  onConfirmChange: (v: string) => void;
}) {
  const pwError = password.length > 0 ? validatePassword(password) : null;
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-foreground">Password</span>
        <Input
          type="password"
          autoComplete="new-password"
          leftIcon={Lock}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-foreground">Confirm password</span>
        <Input
          type="password"
          autoComplete="new-password"
          leftIcon={Lock}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          required
        />
      </label>
      <p className="text-xs text-muted">{PASSWORD_RULES_LABEL}</p>
      {pwError && <p className="text-xs text-amber-600">{pwError}</p>}
      {mismatch && <p className="text-xs text-amber-600">Passwords do not match.</p>}
    </>
  );
}

function OfferResetStep({ onReset, onSkip }: { onReset: () => void; onSkip: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-surface-inset px-3 py-2.5">
        <p className="text-sm font-medium text-foreground">You&rsquo;re signed in.</p>
        <p className="mt-1 text-xs text-muted">
          While you&rsquo;re here — want to set a new password so you can sign in
          faster next time?
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={onReset}>
          Set a new password
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
