import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

/**
 * Lightweight server-side timing wrapper. Logs to stdout (visible in
 * Railway logs) when a labeled async block exceeds `slowMs`, and
 * (always) writes a row to ui_events so the timing breakdown is
 * queryable from Supabase without Railway access.
 *
 *   const rows = await timed("listPlaybookRoster.select", () =>
 *     supabase.from("playbook_members").select(...)
 *   );
 *
 * Tagged log lines are easy to grep:
 *   [perf:slow] listPlaybookRoster.select 842ms
 *
 * To pull the full per-leg distribution from ui_events:
 *   select target, count(*),
 *          percentile_cont(0.5) within group (order by (metadata->>'duration_ms')::numeric) p50,
 *          percentile_cont(0.95) within group (order by (metadata->>'duration_ms')::numeric) p95
 *   from ui_events
 *   where event_name in ('perf_event','slow_action')
 *     and created_at > now() - interval '1 hour'
 *   group by target order by p95 desc;
 *
 * Defaults:
 *   slowMs = 500   — anything slower than this is a candidate for the
 *                    perf punch list (escalates the log to warn level)
 *   alwaysLog = false — set to log every call to stdout (for hot-path
 *                       profiling in Railway logs)
 */
export async function timed<T>(
  label: string,
  // PromiseLike (not Promise) so Supabase query builders work without
  // an extra `await` inside the callback.
  fn: () => PromiseLike<T>,
  options: { slowMs?: number; alwaysLog?: boolean } = {},
): Promise<T> {
  const slowMs = options.slowMs ?? 500;
  const alwaysLog = options.alwaysLog ?? false;
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    return await fn();
  } finally {
    const t1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const dur = t1 - t0;
    const isSlow = dur >= slowMs;
    if (alwaysLog) {
      console.log(`[perf] ${label} ${dur.toFixed(0)}ms`);
    } else if (isSlow) {
      console.warn(`[perf:slow] ${label} ${dur.toFixed(0)}ms`);
    }
    // Fire-and-forget write to ui_events. Always logged (not just slow
    // ones) so we get the full per-leg distribution. Runs after the
    // wrapped fn() resolves, so it never contaminates the measurement.
    recordPerfToDb(label, dur, isSlow);
  }
}

function recordPerfToDb(
  label: string,
  durationMs: number,
  isSlow: boolean,
): void {
  // Skip in environments without Supabase (tests, local without env).
  if (!hasSupabaseEnv()) return;
  try {
    const admin = createServiceRoleClient();
    admin
      .from("ui_events")
      .insert({
        session_id: "server",
        event_name: isSlow ? "slow_action" : "perf_event",
        target: label.slice(0, 256),
        metadata: {
          duration_ms: Math.round(durationMs),
          slow: isSlow,
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // Telemetry must never break the wrapped call.
  }
}
