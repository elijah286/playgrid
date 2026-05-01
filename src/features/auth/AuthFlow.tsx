"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Apple, ArrowLeft, Lock, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { emailHasAccountAction } from "@/app/actions/auth-lookup";
import { afterSignupSyncRoleAction } from "@/app/actions/coach-invitations";
import { updateDisplayNameAction } from "@/app/actions/account";
import { Button, Input, useToast } from "@/components/ui";
import { PASSWORD_RULES_LABEL, validatePassword } from "@/lib/auth/password";
import { suggestEmailDomainCorrection } from "@/lib/auth/email-typo";

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
}: AuthFlowProps) {
  const { toast } = useToast();

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
  const signInWithApple = () => signInWithOAuthProvider("apple", "Apple");
  const signInWithGoogle = () => signInWithOAuthProvider("google", "Google");

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
    try {
      const res = await emailHasAccountAction(trimmed);
      if (!res.ok) throw new Error(res.error);
      if (res.exists) {
        // Existing accounts always land on the password step. OTP-only
        // users can fall through via the "Use a one-time passcode instead"
        // link under the password input.
        setStep("password");
      } else {
        await sendCode({ isNewUser: true, silent: true });
        setStep("code");
      }
    } catch (e: unknown) {
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
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.assign(safeNext);
      return;
    } catch (e: unknown) {
      if (isInvalidCredentials(e)) {
        setBadPassword(true);
      } else {
        setFormError(e instanceof Error ? e.message : "Sign-in failed.");
      }
      submittingRef.current = false;
    } finally {
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
    try {
      const supabase = createClient();
      const { error, data } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;

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
        setStep("new-user-profile");
      } else if (cameFromForgot) {
        setStep("set-new-password");
      } else {
        setStep("offer-reset");
      }
    } catch (e: unknown) {
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
      hardNavigate(safeNext);
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
          {step === "email" && (appleEnabled || googleEnabled) && (
            <>
              {googleEnabled && (
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
              {appleEnabled && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void signInWithApple()}
                  disabled={pending}
                >
                  <Apple className="mr-2 size-4" aria-hidden />
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
