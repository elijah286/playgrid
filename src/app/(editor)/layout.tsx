import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { signOutAction } from "@/app/actions/auth";

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
      <header className="border-b border-slate-200/80 bg-white/80 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/playbooks" className="text-sm font-semibold text-slate-900">
            PlayGrid
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-6">
        {children}
      </div>
    </div>
  );
}
