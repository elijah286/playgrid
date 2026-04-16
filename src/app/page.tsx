import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function HomePage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/playbooks");
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">PlayGrid</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
          Calm play design. Serious printing.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          Design flag and 7v7 offense, preview wristbands and sheets, and carry plays on the field
          — with a structured document model built for AI-assisted edits later.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          Sign in
        </Link>
        <Link
          href="/playbooks"
          className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Go to playbooks
        </Link>
      </div>
    </div>
  );
}
