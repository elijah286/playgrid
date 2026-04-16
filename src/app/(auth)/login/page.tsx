import Link from "next/link";
import { LoginForm } from "./ui";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use your Supabase-authenticated account. Email/password for v1.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
