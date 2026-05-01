import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "./ui";
import { getAuthProvidersConfig } from "@/lib/site/auth-providers-config";

export const metadata: Metadata = {
  title: "Log in or sign up",
  description:
    "Log in to XO Gridmaker or create a free account to design football plays, organize playbooks, and share them with your team.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage() {
  const authProviders = await getAuthProvidersConfig();
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
      </div>
      <Suspense fallback={null}>
        <LoginForm
          appleEnabled={authProviders.apple}
          googleEnabled={authProviders.google}
        />
      </Suspense>
    </div>
  );
}
