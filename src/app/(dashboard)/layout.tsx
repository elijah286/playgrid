import Link from "next/link";
import { redirect } from "next/navigation";
import { FootballIcon } from "@/components/brand/FootballMarks";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { signOutAction } from "@/app/actions/auth";
import { ColorModeToggle } from "@/components/theme/ColorModeToggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-pg-muted">
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <Link
          href="/playbooks"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight text-pg-ink"
        >
          <FootballIcon className="h-8 w-8 shrink-0" />
          <span className="font-display text-xl tracking-[0.08em] text-pg-turf">PLAYGRID</span>
        </Link>
        <div className="flex items-center gap-3">
          <ColorModeToggle />
          {isAdmin && (
            <span className="flex items-center gap-3">
              <Link
                href="/admin/users"
                className="text-sm font-medium text-pg-signal hover:text-pg-signal-deep"
              >
                Admin
              </Link>
              <Link
                href="/admin/integrations"
                className="text-sm font-medium text-pg-signal hover:text-pg-signal-deep"
              >
                Integrations
              </Link>
            </span>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm text-pg-muted ring-1 ring-pg-line hover:bg-pg-chalk dark:hover:bg-pg-surface"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
