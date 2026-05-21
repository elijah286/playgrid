"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { Button } from "@/components/ui";

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

  useEffect(() => {
    if (isStaleClient) {
      // Not an app error — expected version-skew condition. Skip Sentry
      // (would spam the dashboard on every deploy) and reload to recover.
      window.location.reload();
      return;
    }
    Sentry.captureException(error);
  }, [error, isStaleClient]);

  // "Go home" needs to actually go somewhere when the device is offline.
  // /home isn't always in the SW cache (first launch with no signal, or
  // after a fresh install), so landing there can produce the WebView's
  // generic "This page couldn't load" page. /offline is precached at SW
  // install and always serves the downloaded-playbook library — a much
  // better last resort than a dead end.
  const goHome = () => {
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    window.location.href = offline ? "/offline" : "/home";
  };

  if (isStaleClient) {
    // Reload is firing in useEffect; render a quiet placeholder so the
    // user doesn't see a flash of "Something went wrong" before the
    // browser navigates away.
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-muted">Updating to the latest version…</p>
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
