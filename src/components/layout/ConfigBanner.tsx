import { AlertTriangle } from "lucide-react";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export function ConfigBanner() {
  if (hasSupabaseEnv()) return null;
  return (
    <div className="border-b border-warning/20 bg-warning-light px-4 py-2.5 text-center text-sm text-foreground">
      <span className="inline-flex items-center gap-2">
        <AlertTriangle className="size-4 text-warning" />
        Configure{" "}
        <code className="rounded bg-warning/10 px-1.5 py-0.5 text-xs font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-warning/10 px-1.5 py-0.5 text-xs font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
        in <code className="rounded bg-warning/10 px-1.5 py-0.5 text-xs font-mono">.env.local</code>
      </span>
    </div>
  );
}
