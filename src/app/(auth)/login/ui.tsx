"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Ticket, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { afterSignupSyncRoleAction } from "@/app/actions/coach-invitations";
import { Button, Input, SegmentedControl } from "@/components/ui";
import { Card, CardBody } from "@/components/ui";
import { useToast } from "@/components/ui";

type SignInStage = "password" | "otp-request" | "otp-verify";

/**
 * Heuristic: Supabase surfaces "Invalid login credentials" (and friends)
 * when the email+password pair doesn't match. We want those to render as
 * the recoverable bad-password state rather than a generic error.
 */
function isInvalidCredentials(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid email or password") ||
    msg.includes("invalid_grant")
  );
}

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const urlInvite = searchParams.get("invite")?.trim() ?? "";
  const nextParam = searchParams.get("next") ?? "";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(urlInvite ? "signup" : "signin");
  const [inviteCode, setInviteCode] = useState(urlInvite.toUpperCase());
  const [showInviteField, setShowInviteField] = useState(Boolean(urlInvite));
  const [pending, setPending] = useState(false);

  const [stage, setStage] = useState<SignInStage>("password");
  const [otpCode, setOtpCode] = useState("");
  const [badPassword, setBadPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (urlInvite) {
      setInviteCode(urlInvite.toUpperCase());
      setShowInviteField(true);
      setMode("signup");
    }
  }, [urlInvite]);

  // Reset transient errors when the user edits the form.
  useEffect(() => {
    setBadPassword(false);
    setFormError(null);
  }, [email, password, mode, stage]);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/reset-password`;
  }, []);

  async function submitPassword() {
    if (!hasSupabaseEnv()) {
      setFormError("Supabase is not configured. Add .env.local keys.");
      return;
    }
    setPending(true);
    setBadPassword(false);
    setFormError(null);
    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const trimmedCode = inviteCode.trim().toUpperCase();
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: trimmedCode
            ? { data: { invite_code: trimmedCode } }
            : undefined,
        });
        if (err) throw err;

        if (data.session) {
          const res = await afterSignupSyncRoleAction();
          if (res.ok && res.role === "coach") {
            toast("Your coach account is ready.", "success");
          } else if (trimmedCode && res.ok && res.role !== "coach") {
            toast("Account created, but that invite code was invalid or already used.", "error");
          }
        } else if (trimmedCode) {
          toast(
            "Check your email to confirm your account. Your coach access activates after you sign in.",
            "success",
          );
        }
      }
      router.push(safeNext || "/home");
      router.refresh();
    } catch (e: unknown) {
      if (mode === "signin" && isInvalidCredentials(e)) {
        setBadPassword(true);
      } else {
        setFormError(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      setPending(false);
    }
  }

  async function sendOtp() {
    if (!email) {
      setFormError("Enter your email first.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setStage("otp-verify");
      setOtpCode("");
      toast("Code sent. Check your email.", "success");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not send code.");
    } finally {
      setPending(false);
    }
  }

  async function verifyOtp() {
    if (otpCode.trim().length !== 6) {
      setFormError("Enter the 6-digit code from your email.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode.trim(),
        type: "email",
      });
      if (error) throw error;
      router.push(safeNext || "/home");
      router.refresh();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "That code didn't work. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function sendPasswordReset() {
    if (!email) {
      setFormError("Enter your email first.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      toast("Password reset link sent. Check your email.", "success");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not send reset email.");
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (mode === "signup") return void submitPassword();
    if (stage === "password") return void submitPassword();
    if (stage === "otp-request") return void sendOtp();
    if (stage === "otp-verify") return void verifyOtp();
  }

  if (!hasSupabaseEnv()) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-warning">
            Add <code className="rounded bg-warning-light px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and{" "}
            <code className="rounded bg-warning-light px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            to <code className="rounded bg-warning-light px-1.5 py-0.5 font-mono text-xs">.env.local</code>, then restart.
          </p>
        </CardBody>
      </Card>
    );
  }

  const onOtpFlow = stage !== "password";
  const primaryLabel =
    mode === "signup"
      ? "Create account"
      : stage === "password"
        ? "Sign in"
        : stage === "otp-request"
          ? "Email me a code"
          : "Verify code";

  return (
    <Card>
      <CardBody className="space-y-5">
        {!onOtpFlow && (
          <SegmentedControl
            options={[
              { value: "signin" as const, label: "Sign in" },
              { value: "signup" as const, label: "Create account" },
            ]}
            value={mode}
            onChange={setMode}
            className="w-full [&>button]:flex-1"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-foreground">Email</span>
            <Input
              type="email"
              autoComplete="email"
              leftIcon={Mail}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={stage === "otp-verify"}
              required
            />
          </label>

          {!onOtpFlow && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-foreground">Password</span>
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                leftIcon={Lock}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}

          {stage === "otp-verify" && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-foreground">6-digit code</span>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="font-mono tracking-[0.3em]"
                required
              />
              <p className="mt-1 text-xs text-muted">
                Sent to {email}. Didn&rsquo;t arrive?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:text-primary-hover"
                  onClick={sendOtp}
                  disabled={pending}
                >
                  Resend
                </button>
              </p>
            </label>
          )}

          {mode === "signup" && !onOtpFlow && (
            showInviteField ? (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-foreground">
                  Invite code <span className="text-xs font-normal text-muted">(for coaches)</span>
                </span>
                <Input
                  type="text"
                  autoComplete="off"
                  leftIcon={Ticket}
                  placeholder="COACH-XXXXXXXXXX"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase tracking-wide"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setShowInviteField(true)}
                className="text-xs font-medium text-primary hover:text-primary-hover"
              >
                Have an invite code?
              </button>
            )
          )}

          {badPassword && mode === "signin" && stage === "password" && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm">
              <p className="font-medium text-danger">
                We couldn&rsquo;t sign you in with that password.
              </p>
              <p className="mt-1.5 text-xs text-muted">Try one of these:</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={sendPasswordReset}
                  disabled={pending}
                  className="text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-50"
                >
                  Reset your password
                </button>
                <span className="text-xs text-muted">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setStage("otp-request");
                    setBadPassword(false);
                    void sendOtp();
                  }}
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

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={pending}
          >
            {primaryLabel}
          </Button>
        </form>

        {mode === "signin" && !onOtpFlow && (
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={sendPasswordReset}
              disabled={pending}
              className="font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("otp-request");
                void sendOtp();
              }}
              disabled={pending}
              className="font-medium text-primary hover:text-primary-hover disabled:opacity-50"
            >
              Email me a 6-digit code
            </button>
          </div>
        )}

        {onOtpFlow && (
          <button
            type="button"
            onClick={() => {
              setStage("password");
              setOtpCode("");
              setFormError(null);
            }}
            disabled={pending}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
          >
            <ArrowLeft className="size-3" /> Back to password sign-in
          </button>
        )}
      </CardBody>
    </Card>
  );
}
