"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

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
