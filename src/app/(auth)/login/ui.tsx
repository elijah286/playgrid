"use client";

import { useSearchParams } from "next/navigation";
import { AuthFlow } from "@/features/auth/AuthFlow";

export function LoginForm() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
  const inviteCode = searchParams.get("invite")?.trim().toUpperCase() || undefined;

  return <AuthFlow next={safeNext || undefined} inviteCode={inviteCode} />;
}
