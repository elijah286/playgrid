import { hasSupabaseEnv } from "@/lib/supabase/config";

export function ConfigBanner() {
  if (hasSupabaseEnv()) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      Configure{" "}
      <code className="rounded bg-amber-100 px-1 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code className="rounded bg-amber-100 px-1 py-0.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
      in <code className="rounded bg-amber-100 px-1 py-0.5">.env.local</code>.
    </div>
  );
}
