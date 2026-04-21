import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Best-effort client IP from request headers. Vercel/most proxies set
 * `x-forwarded-for`; we take the first hop. Falls back to "unknown" so
 * the bucket key still works (shared bucket for unknown clients is fine
 * for rate-limiting purposes — it just means misconfigured clients share
 * a budget).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * DB-backed sliding-window rate limit. Returns true when the caller is
 * within budget, false when they should be rejected. Fails open on DB
 * error so a Supabase hiccup doesn't lock everyone out.
 */
export async function rateLimit(
  bucket: string,
  opts: { windowSeconds: number; max: number },
): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("rate_limit_check", {
      p_bucket: bucket,
      p_window_seconds: opts.windowSeconds,
      p_max: opts.max,
    });
    if (error) return true;
    return Boolean(data);
  } catch {
    return true;
  }
}
