"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

// Auto-reload loop guard. We only auto-reload if we haven't already done
// so within RELOAD_GUARD_MS. A transient error (e.g. post-deploy version
// skew, where a stale WebView holds chunk hashes the new bundle no longer
// serves) heals on a single fresh load. A genuinely persistent root crash
// errors again immediately — the recent timestamp then makes us fall back
// to the manual message instead of reloading forever. The stamp goes stale
// after the window, so a *later*, unrelated transient can still self-heal.
const RELOAD_GUARD_KEY = "xo-global-error-reload-at";
const RELOAD_GUARD_MS = 15_000;

function shouldAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
    return !last || Date.now() - last > RELOAD_GUARD_MS;
  } catch {
    // sessionStorage unavailable → we can't guard against a reload loop,
    // so don't auto-reload. Show the manual recovery instead.
    return false;
  }
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  // Decide once, on mount, before the reload fires — so render and effect
  // agree on which UI to show.
  const [autoReloading] = useState(shouldAutoReload);

  useEffect(() => {
    Sentry.captureException(error);
    if (!autoReloading) return;
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // ignore — worst case we reload without stamping (the read above
      // already returned true, so we won't be in a tight loop)
    }
    // Flush first so the error still reaches Sentry before the page tears
    // down (a bare reload usually drops the in-flight event). Reload even
    // if the flush times out — recovery must never hang on the network.
    void Sentry.flush(2000).finally(() => window.location.reload());
  }, [error, autoReloading]);

  // global-error replaces the ENTIRE root layout when it fires, so it
  // inherits none of the app's chrome: no `native-app` body class, no
  // header `env(safe-area-inset-top)` padding, not even the global
  // stylesheet (hence the inline styles). Centering the content keeps it
  // clear of the iPhone dynamic island / camera / clock and the home
  // indicator by construction; the `max(inset, 24px)` padding is a
  // belt-and-suspenders floor on top of that.
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
          {autoReloading ? (
            <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
              Reloading…
            </p>
          ) : (
            <>
              <h1 style={{ fontSize: 20, margin: 0, fontWeight: 600 }}>
                Something went wrong.
              </h1>
              <p
                style={{
                  color: "#64748b",
                  fontSize: 14,
                  margin: 0,
                  maxWidth: 340,
                }}
              >
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
            </>
          )}
        </div>
      </body>
    </html>
  );
}
