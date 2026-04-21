import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "./ui";

export default function LoginPage() {
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
        <LoginForm />
      </Suspense>
    </div>
  );
}
