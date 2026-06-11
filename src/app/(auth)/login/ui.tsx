"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthFlow, type Step } from "@/features/auth/AuthFlow";

export function LoginForm({
  appleEnabled,
  googleEnabled,
  googleOAuthWebClientId,
  googleOAuthIosClientId,
}: {
  appleEnabled: boolean;
  googleEnabled: boolean;
  googleOAuthWebClientId: string | null;
  googleOAuthIosClientId: string | null;
}) {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
  const inviteCode = searchParams.get("invite")?.trim().toUpperCase() || undefined;
  const explicitSignup = searchParams.get("mode") === "signup";
  const reason = searchParams.get("reason");
  const error = searchParams.get("error");

  // Claim flows (someone forwarded a copy / example link) almost always
  // bring net-new users — surfacing "Welcome back" makes them think they
  // already have an account they don't remember. Treat any /copy/* next
  // param as signup intent so the heading defaults to "Get started"
  // until AuthFlow's email step actually confirms an existing account.
  const isClaimFlow = safeNext.startsWith("/copy/") || safeNext.startsWith("/copy?");
  const isSignup = explicitSignup || isClaimFlow;

  const [step, setStep] = useState<Step>("email");

  // Three-state title. Prospects landing on /login overwhelmingly bounced
  // when they saw "Welcome back" — they assumed the page wasn't for them
  // (88.8% of /login sessions in the last 30d never fired a single auth
  // event). Default to a neutral framing that works for both audiences and
  // let AuthFlow's email step route them once we know who they are.
  //   - "Welcome back": only after we've confirmed an existing account
  //     (password / recovery steps).
  //   - "Get started": when an upstream link explicitly signalled signup
  //     intent (mode=signup or a /copy/* claim flow).
  //   - Neutral default: the email step when intent is unknown.
  const welcomeSteps: Step[] = ["password", "offer-reset", "set-new-password"];
  const isWelcomeBackStep = welcomeSteps.includes(step);
  let title: string;
  let subtitle: string;
  if (isWelcomeBackStep) {
    title = "Welcome back";
    subtitle = "Sign in to your XO Gridmaker account to access your playbooks.";
  } else if (isSignup) {
    title = "Get started";
    subtitle = "Create your XO Gridmaker account to start building playbooks.";
  } else {
    title = "Sign in or create an account";
    subtitle =
      "Enter your email — we'll sign you in if you have an account, or get you started if you're new.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
      </div>
      {reason === "signed_out_elsewhere" ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800">
          You were signed out because your account signed in on another
          device. If that wasn&rsquo;t you,{" "}
          <a href="/account" className="font-semibold underline">
            change your password
          </a>{" "}
          after signing in.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-800">
          Sign-in didn&rsquo;t finish: {error}
        </div>
      ) : null}
      <AuthFlow
        next={safeNext || undefined}
        inviteCode={inviteCode}
        onStepChange={setStep}
        appleEnabled={appleEnabled}
        googleEnabled={googleEnabled}
        googleOAuthWebClientId={googleOAuthWebClientId}
        googleOAuthIosClientId={googleOAuthIosClientId}
      />
    </div>
  );
}
