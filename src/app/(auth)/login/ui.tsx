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

  const [step, setStep] = useState<Step>("email");

  // Headline flips from "Get started" to "Welcome back" once AuthFlow detects
  // the typed email already has an account (step advances to "password"). In
  // sign-in mode we always show "Welcome back".
  const showWelcomeBack = !isSignup || step !== "email";
  const title = showWelcomeBack ? "Welcome back" : "Get started";
  const subtitle = showWelcomeBack
    ? "Sign in to your PlayGrid account to access your playbooks."
    : "Create your PlayGrid account to start building playbooks.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
      </div>
      <AuthFlow
        next={safeNext || undefined}
        inviteCode={inviteCode}
        onStepChange={setStep}
      />
    </div>
  );
}
