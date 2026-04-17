import { hasSupabaseEnv } from "@/lib/supabase/config";

export function ConfigBanner() {
  if (hasSupabaseEnv()) return null;
  return (
    <div className="border-b border-pg-signal-ring/80 bg-pg-signal-soft px-4 py-2 text-center text-sm text-pg-signal-deep dark:border-pg-signal-deep/50 dark:bg-pg-signal-deep/25 dark:text-pg-signal-bright">
      <span className="font-medium">Sideline notice:</span> Configure{" "}
      <code className="rounded bg-white/80 px-1 py-0.5 ring-1 ring-pg-signal-ring/60 dark:bg-pg-chalk/15 dark:text-pg-mist dark:ring-pg-signal-ring/40">
        NEXT_PUBLIC_SUPABASE_URL
      </code>{" "}
      and{" "}
      <code className="rounded bg-white/80 px-1 py-0.5 ring-1 ring-pg-signal-ring/60 dark:bg-pg-chalk/15 dark:text-pg-mist dark:ring-pg-signal-ring/40">
        NEXT_PUBLIC_SUPABASE_ANON_KEY
      </code>{" "}
      in{" "}
      <code className="rounded bg-white/80 px-1 py-0.5 ring-1 ring-pg-signal-ring/60 dark:bg-pg-chalk/15 dark:text-pg-mist dark:ring-pg-signal-ring/40">
        .env.local
      </code>
      .
    </div>
  );
}
