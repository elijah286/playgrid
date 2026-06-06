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

  // global-error replaces the ENTIRE root layout when it fires, so it
  // inherits none of the app's chrome: no `native-app` body class, no
  // header `env(safe-area-inset-top)` padding, not even the global
  // stylesheet (hence the inline styles). The previous top-left layout
  // rendered the text flush against the viewport top — i.e. under the
  // iPhone dynamic island / camera / clock, where it was unreadable.
  //
  // Centering the message in the viewport keeps it clear of the notch and
  // home indicator by construction, regardless of whether safe-area insets
  // resolve in this bare document; the `max(inset, 24px)` padding is a
  // belt-and-suspenders floor on top of that. The Reload button gives a
  // one-tap recovery so a transient error no longer forces an app kill.
  return (
    <html>
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            boxSizing: "border-box",
            padding:
              "max(env(safe-area-inset-top, 0px), 24px) 24px max(env(safe-area-inset-bottom, 0px), 24px)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 20, margin: 0, fontWeight: 600 }}>
            Something went wrong.
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0, maxWidth: 340 }}>
            The team has been notified. Reload to try again — if the issue
            persists, let us know.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 600,
              color: "#ffffff",
              background: "#2563eb",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
