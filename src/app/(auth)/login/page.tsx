import Link from "next/link";
import { FootballIcon } from "@/components/brand/FootballMarks";
import { SiteHeaderBar } from "@/components/layout/SiteHeaderBar";
import { LoginForm } from "./ui";

export default function LoginPage() {
  return (
    <div className="relative mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <SiteHeaderBar />
      <div>
        <Link href="/" className="text-sm text-pg-subtle hover:text-pg-ink">
          ← Home
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <FootballIcon className="h-10 w-10 shrink-0" />
          <h1 className="font-display text-4xl tracking-wide text-pg-turf">Locker room</h1>
        </div>
        <p className="mt-3 text-sm text-pg-muted">
          Sign in with your team account. Email and password for v1.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
