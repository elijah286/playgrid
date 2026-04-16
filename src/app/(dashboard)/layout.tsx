import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { signOutAction } from "@/app/actions/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted">
          Add Supabase environment variables to use authenticated playbooks.
        </p>
        <div className="mt-6">{children}</div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/home" className="text-lg font-extrabold tracking-tight text-primary">
            PlayGrid
          </Link>
          <nav className="hidden gap-1 sm:flex">
            <Link
              href="/home"
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
            >
              Home
            </Link>
            <Link
              href="/playbooks"
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
            >
              Playbooks
            </Link>
          </nav>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-surface-inset transition-colors"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
