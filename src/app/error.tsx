"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { Button } from "@/components/ui";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { probeConnectivity } from "@/lib/offline/connectivity";

/**
 * Offline safety net: a coach without signal who reaches a playbook's
 * ONLINE route (/playbooks/<id>) errors here when the data fetch fails. If
 * that playbook is downloaded, the right answer isn't an error screen —
 * it's the offline copy. Verified with a real probe (never the unreliable
 * `navigator.onLine`) so an online crash on the same route still shows the
 * normal error UI instead of bouncing a connected coach to the viewer.
 * Returns true if a redirect was issued.
 */
async function redirectToOfflineCopyIfAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const match = window.location.pathname.match(/^\/playbooks\/([^/]+)/);
  if (!match) return false;
  try {
    const { getCachedPlaybookMeta } = await import("@/lib/offline/db");
    const meta = await getCachedPlaybookMeta(match[1]!);
    if (!meta) return false;
    if (await probeConnectivity()) return false;
    window.location.replace(`/offline/${match[1]}`);
    return true;
  } catch {
    return false;
  }
}

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // After a deploy, server-action IDs change. A user with a stale tab open
  // (old client JS) hits a 404 on the next action call — Next.js surfaces
  // this as UnrecognizedActionError. The fix is a hard reload so the
  // browser fetches the new JS; the next click then matches.
  const isStaleClient = unstable_isUnrecognizedActionError(error);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (isStaleClient) {
      // Not an app error — expected version-skew condition. Skip Sentry
      // (would spam the dashboard on every deploy) and reload to recover.
      window.location.reload();
      return;
    }
    void redirectToOfflineCopyIfAvailable().then((redirected) => {
      if (redirected) setRedirecting(true);
    });
    Sentry.captureException(error);
  }, [error, isStaleClient]);

  // "Go home" needs to actually go somewhere when the device is offline.
  // /home isn't always in the SW cache (first launch with no signal, or
  // after a fresh install), so landing there can produce the WebView's
  // generic "This page couldn't load" page. /offline is precached at SW
  // install and always serves the downloaded-playbook library — a much
  // better last resort than a dead end. Probe rather than trust
  // navigator.onLine (WKWebView reports true in airplane mode).
  const goHome = () => {
    void probeConnectivity().then((online) => {
      window.location.href = online ? "/home" : "/offline";
    });
  };

  if (isStaleClient || redirecting) {
    // Reload/redirect is firing in useEffect; render a quiet placeholder so
    // the user doesn't see a flash of "Something went wrong" before the
    // browser navigates away.
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-muted">
          {redirecting
            ? "Opening your downloaded playbook…"
            : "Updating to the latest version…"}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted">
        The team has been notified. You can try again, or head back home.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button variant="secondary" onClick={goHome}>
          Go home
        </Button>
      </div>
    </div>
  );
}
