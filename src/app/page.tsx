import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FlaskConical, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getExamplesPageEnabled } from "@/lib/site/examples-config";

export default async function HomePage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/home");
  }

  const examplesEnabled = await getExamplesPageEnabled();

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-dark">
      {/* Yard-line pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 h-px bg-white"
            style={{ top: `${(i + 1) * 8}%` }}
          />
        ))}
      </div>

      {/* Diagonal accent stripe */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rotate-12 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 bottom-0 h-96 w-96 -rotate-12 rounded-full bg-field/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-4xl flex-col justify-center gap-12 px-6 py-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
            <Zap className="size-4" />
            Built for gameday
          </div>
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
            Design plays.
            <br />
            <span className="text-primary">Win games.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">
            Create offense, preview wristbands, and carry your playbook to the field. Built for
            flag football, 7v7, and tackle coaches who take their game seriously.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-bold text-white shadow-lg transition-colors hover:bg-primary-hover"
          >
            Get started
            <ArrowRight className="size-5" />
          </Link>
          {examplesEnabled && (
            <Link
              href="/examples"
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-6 py-3 text-base font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
            >
              <FlaskConical className="size-5" />
              Browse examples
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
