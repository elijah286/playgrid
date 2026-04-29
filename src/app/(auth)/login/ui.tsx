"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthFlow, type Step } from "@/features/auth/AuthFlow";

export function LoginForm() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
  const inviteCode = searchParams.get("invite")?.trim().toUpperCase() || undefined;
  const isSignup = searchParams.get("mode") === "signup";
  const reason = searchParams.get("reason");

  const [step, setStep] = useState<Step>("email");

  // "Welcome back" once AuthFlow advances to the password step (we've
  // confirmed the email has an account) or any existing-user follow-ups.
  // "Get started" for the email step in signup mode and for the code step
  // (which new signups always land on).
  const welcomeSteps: Step[] = ["password", "offer-reset", "set-new-password"];
  const showWelcomeBack =
    welcomeSteps.includes(step) || (step === "email" && !isSignup);
  const title = showWelcomeBack ? "Welcome back" : "Get started";
  const subtitle = showWelcomeBack
    ? "Sign in to your XO Gridmaker account to access your playbooks."
    : "Create your XO Gridmaker account to start building playbooks.";

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
      <AuthFlow
        next={safeNext || undefined}
        inviteCode={inviteCode}
        onStepChange={setStep}
      />
    </div>
  );
}
