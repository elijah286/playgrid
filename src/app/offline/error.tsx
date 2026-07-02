"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Segment error boundary for the offline viewer (/offline and
 * /offline/[playbookId]).
 *
 * Without this file, any render/effect crash in the offline shell escalates
 * to src/app/error.tsx — or, when the throw happens above it, to
 * global-error.tsx, which replaces the whole document ("Something went
 * wrong. The team has been notified.") on the one surface where a coach has
 * no network to recover with. This boundary keeps the failure INSIDE the
 * offline shell: root layout (and its .native-shell chrome) stays mounted,
 * and recovery never needs the network.
 *
 * Offline constraints, deliberately:
 * - "Try again" calls reset() — clears the boundary and re-renders the
 *   segment from scratch (fresh mount → IndexedDB reads re-run). NOT
 *   unstable_retry(), which re-fetches the segment payload and would fail
 *   with no signal.
 * - The escape hatch is a hard <a href="/offline"> (not next/link) so the
 *   SW-cached shell serves without an RSC round-trip, same as the other
 *   offline components.
 */
export default function OfflineViewerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort: offline this can't send, but the boundary also covers
    // online visits to /offline/* and Sentry buffers what it can.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <AlertTriangle className="mx-auto size-8 text-muted" />
      <p className="mt-2 text-sm font-medium text-foreground">
        Couldn&rsquo;t open the offline viewer
      </p>
      <p className="mt-1 text-xs text-muted">
        Your downloaded playbooks are still on this device. This is usually a
        hiccup right after launch — trying again almost always recovers.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="primary" leftIcon={RefreshCw} onClick={() => reset()}>
          Try again
        </Button>
        <a
          href="/offline"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-surface-inset"
        >
          <ArrowLeft className="size-4" />
          Offline library
        </a>
      </div>
    </div>
  );
}
