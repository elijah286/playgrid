/**
 * Lightweight server-side timing wrapper. Logs to stdout (visible in
 * Railway logs) when a labeled async block exceeds `slowMs`. Use it to
 * instrument server actions, route handlers, or helper functions that
 * touch the database or external services.
 *
 *   const rows = await timed("listPlaybookRoster.select", () =>
 *     supabase.from("playbook_members").select(...)
 *   );
 *
 * Tagged log lines are easy to grep:
 *   [perf:slow] listPlaybookRoster.select 842ms
 *
 * Defaults:
 *   slowMs = 500   — anything slower than this is a candidate for the
 *                    perf punch list
 *   alwaysMs = null — set to log every call (for hot-path profiling)
 */
export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
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
    if (alwaysLog) {
      console.log(`[perf] ${label} ${dur.toFixed(0)}ms`);
    } else if (dur >= slowMs) {
      console.warn(`[perf:slow] ${label} ${dur.toFixed(0)}ms`);
    }
  }
}
