import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ResetPasswordForm } from "./ui";

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to sign-in
        </Link>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-muted">
          Choose a new password for your PlayGrid account.
        </p>
      </div>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
