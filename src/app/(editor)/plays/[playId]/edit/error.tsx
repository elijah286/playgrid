"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { probeConnectivity } from "@/lib/offline/connectivity";
import { checkCachedRoutes } from "@/lib/native/registerServiceWorker";

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
        if (online) {
          setMode("error");
          return;
        }
        // Offline — but that alone does NOT mean "unavailable". If this play's
        // page IS in the cache it should have rendered, so landing here is a
        // real bug and calling it "not available offline" would blame the
        // coach's connection for our crash (exactly the lie "Playbook not
        // found" told this morning). Only an uncached play is genuinely
        // unavailable.
        const playId = window.location.pathname.match(/^\/plays\/([^/]+)\/edit/)?.[1];
        const route = playId ? `/plays/${playId}/edit` : null;
        const cached = route
          ? await checkCachedRoutes([route]).catch(() => new Set<string>())
          : new Set<string>();
        if (!alive) return;
        setMode(route && cached.has(route) ? "error" : "unavailableOffline");
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
        {/* Show what threw HERE TOO. This branch is supposed to mean "nothing
            was cached", but if that's ever wrong we'd be silently blaming the
            coach's connection for a crash — and offline is exactly when Sentry
            is unreachable, so the screen is the only place the truth can appear.
            Muted and small: informative if you look, ignorable if you don't. */}
        <ErrorDetail error={error} />
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
      <ErrorDetail error={error} />
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

/**
 * What actually threw — message + the top stack frames.
 *
 * It's already sent to Sentry, but an offline crash is precisely the case where
 * Sentry is unreachable, so the screen is the only place the truth can surface.
 * "Load failed" (WebKit's fetch-failure message) tells us a fetch died but not
 * WHICH one; the stack names it. Even minified, the chunk filename identifies
 * the module — which is the whole question.
 *
 * Deliberately quiet: small, muted, below the fold of attention. A coach who
 * doesn't care sees a tidy message; a coach who's debugging with us can tap
 * Copy and paste the whole thing.
 */
function ErrorDetail({ error }: { error: Error & { digest?: string } }) {
  const [copied, setCopied] = useState(false);
  if (!error?.message) return null;

  const detail = [
    error.message,
    error.digest ? `digest: ${error.digest}` : null,
    error.stack ? `\n${error.stack.split("\n").slice(0, 6).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto mt-4 max-w-md">
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-inset px-3 py-2 text-left font-mono text-[10px] leading-snug text-muted/80">
        {detail}
      </pre>
      <button
        type="button"
        className="mt-1 text-[11px] font-medium text-muted underline underline-offset-2"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(detail)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? "Copied" : "Copy error"}
      </button>
    </div>
  );
}
