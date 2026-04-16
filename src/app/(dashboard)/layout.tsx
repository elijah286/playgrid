import Link from "next/link";
import { redirect } from "next/navigation";
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
        <p className="text-sm text-slate-600">
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
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <Link href="/playbooks" className="text-lg font-semibold tracking-tight text-slate-900">
          PlayGrid
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-white"
          >
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
