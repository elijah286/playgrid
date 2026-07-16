"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { probeConnectivity } from "@/lib/offline/connectivity";

/**
 * Editor segment error boundary.
 *
 * OFFLINE POLICY (2026-07-16, founder rule): a play is either rendered
 * CORRECTLY — by the real editor, same engine, same data — or we say it isn't
 * available offline. There is no degraded lookalike.
 *
 * This boundary used to draw the play itself with `PlayDocRender` (the Coach Cal
 * chat-embed renderer) as a read-only "offline view". It was a second SVG engine
 * pretending to be the first, and it silently diverged: horizontal instead of
 * rotated yard numbers, the free-form 50-yard fallback instead of the playbook's
 * real field position, and NO defense overlay (PlayDocRender's whole API is
 * `{doc, linkTo}` — there was never a channel for opponents). A coach reported
 * "the plays look totally different" TWICE in 24h, because the lookalike was
 * convincing enough to hide its own wrongness — strictly worse than no view.
 *
 * The real editor renders offline just fine; it was only ever UNREACHABLE. A
 * client-side nav re-runs the editor's server tree (and an SW cache hit replays
 * a full-tree RSC payload cross-context — the hazard next.config.ts names),
 * which threw into this boundary. Downloaded plays are now opened with a
 * DOCUMENT navigation (see PlayTileLink), so the SW serves the HTML precached at
 * download time and the REAL EditorCanvas hydrates — verified identical to
 * online on a real iPad, 2026-07-16.
 *
 * So reaching this boundary while offline now means the play genuinely is not
 * available on this device (its page never cached, or the Cache API was evicted).
 * The honest message IS the feature.
 */
type Mode = "checking" | "unavailableOffline" | "error";

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    Sentry.captureException(error);
    let alive = true;
    void (async () => {
      if (!isNativeApp()) {
        if (alive) setMode("error");
        return;
      }
      try {
        // Only claim "offline" when the probe confirms it — an ONLINE crash is a
        // genuine bug and must surface as an error, never be softened into a
        // connectivity excuse.
        const online = await probeConnectivity();
        if (!alive) return;
        setMode(online ? "error" : "unavailableOffline");
      } catch {
        if (alive) setMode("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [error]);

  if (mode === "checking") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-muted">Opening play…</p>
      </div>
    );
  }

  if (mode === "unavailableOffline") {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <WifiOff className="mx-auto size-8 text-muted" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">
          This play isn&rsquo;t available offline
        </h1>
        <p className="mt-2 text-sm text-muted">
          It hasn&rsquo;t finished downloading to this device. Open its playbook
          while you&rsquo;re online and tap &ldquo;Available offline&rdquo; —
          plays with a green check are ready for the sideline.
        </p>
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  // Genuine error (online).
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <AlertTriangle className="mx-auto size-8 text-muted" />
      <h1 className="mt-3 text-xl font-semibold text-foreground">
        Something went wrong.
      </h1>
      <p className="mt-2 text-sm text-muted">
        The team has been notified. You can try again, or head back.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="primary" leftIcon={RefreshCw} onClick={reset}>
          Try again
        </Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/home")}>
          Go home
        </Button>
      </div>
    </div>
  );
}
