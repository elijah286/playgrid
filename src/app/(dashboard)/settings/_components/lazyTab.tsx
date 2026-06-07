"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-side lazy loading for the Site admin's heavier tabs.
 *
 * `useLazyData` is called once per lazy tab at the top of SettingsClient.
 * It fires its loader the first time the tab becomes active and caches the
 * result for the rest of the session, so re-opening the tab is instant and
 * the data never blocks the initial page load. `<LazyContent>` renders the
 * loading skeleton / error / loaded content for that state.
 */

export type LazyState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; data: T };

/**
 * Fetch `load()` the first time `active` turns true, then cache. Re-running
 * is opt-in via the returned `reload` (used by the error retry button).
 */
export function useLazyData<T>(
  active: boolean,
  load: () => Promise<T>
): LazyState<T> & { reload: () => void } {
  // Only the resolved outcome is stored; the "loading" state is derived from
  // (active && started && no result yet). Storing the result rather than
  // setting "loading" synchronously keeps setState out of the effect body —
  // it only runs in the async then/catch callbacks.
  const [result, setResult] = useState<
    { status: "done"; data: T } | { status: "error"; error: string } | null
  >(null);
  // Guards against re-fetching once a tab has loaded. `nonce` lets `reload`
  // re-trigger the effect after a failure. Server-action loader references
  // are stable across renders, so `load` is a safe dependency.
  const startedRef = useRef(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    load()
      .then((data) => setResult({ status: "done", data }))
      .catch((e) =>
        setResult({
          status: "error",
          error:
            e instanceof Error ? e.message : "Could not load this section.",
        })
      );
  }, [active, load, nonce]);

  const reload = useCallback(() => {
    startedRef.current = false;
    setResult(null);
    setNonce((n) => n + 1);
  }, []);

  const state: LazyState<T> = result
    ? result
    : active
    ? { status: "loading" }
    : { status: "idle" };

  return { ...state, reload };
}

/** Renders skeleton / error / loaded content for a lazy tab. */
export function LazyContent<T>({
  state,
  children,
}: {
  state: LazyState<T> & { reload: () => void };
  children: (data: T) => React.ReactNode;
}) {
  if (state.status === "done") return <>{children(state.data)}</>;
  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-border bg-surface-raised p-4 text-sm">
        <p className="text-red-700 dark:text-red-300">{state.error}</p>
        <button
          type="button"
          onClick={state.reload}
          className="mt-3 inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Try again
        </button>
      </div>
    );
  }
  return <TabSkeleton />;
}

/** Generic content-area skeleton shown while a lazy tab loads. */
export function TabSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-9 w-40 animate-pulse rounded-lg bg-border" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-border/70" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-border/60" />
    </div>
  );
}
