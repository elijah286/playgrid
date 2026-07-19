"use client";

import Link from "next/link";

/** Error boundary for the new-UX shell — keeps a failure contained to /app
 *  with a retry + an escape hatch back to production. */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-extrabold text-foreground">Something went wrong</h1>
      <p className="mt-1.5 text-sm text-muted">
        Couldn&rsquo;t load this screen. This is a preview — production is unaffected.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-surface-inset"
        >
          Back to Production
        </Link>
      </div>
    </div>
  );
}
