/**
 * Race a promise against a soft timeout. If the promise resolves first, its
 * value is returned. If the timer fires first, the supplied fallback is
 * returned and the original promise is left dangling — it may resolve later
 * with no observer, which is fine for read-only fetches.
 *
 * Used to keep dashboard renders responsive when a single upstream call
 * stalls (typical on a Capacitor shell with no signal). The caller picks a
 * fallback that matches the action's "empty" shape so downstream code reads
 * a normal-looking value instead of branching on a sentinel.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
