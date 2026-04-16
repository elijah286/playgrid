import Link from "next/link";
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
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to your PlayGrid account to access your playbooks.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
