import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { signOutAction } from "@/app/actions/auth";
import { ColorModeToggle } from "@/components/theme/ColorModeToggle";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) {
    return <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-pg-line/80 bg-pg-chalk/85 px-6 py-3 backdrop-blur dark:bg-pg-turf-deep/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/playbooks" className="font-display text-sm tracking-wide text-pg-turf">
            PLAYGRID
          </Link>
          <div className="flex items-center gap-3">
            <ColorModeToggle />
            <form action={signOutAction}>
              <button type="submit" className="text-sm text-pg-muted hover:text-pg-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-6">
        {children}
      </div>
    </div>
  );
}
