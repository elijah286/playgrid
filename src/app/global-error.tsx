"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong.</h1>
          <p style={{ color: "#64748b", fontSize: 14 }}>
            The team has been notified. Try reloading — if the issue persists, let us know.
          </p>
        </div>
      </body>
    </html>
  );
}
