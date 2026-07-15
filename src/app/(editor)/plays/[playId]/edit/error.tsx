"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw, WifiOff } from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import { Button } from "@/components/ui";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { probeConnectivity } from "@/lib/offline/connectivity";
import { PlayDocRender } from "@/features/coach-ai/PlayDiagramEmbed";
import { NotesMarkdown } from "@/features/editor/NotesMarkdown";

/**
 * Editor segment error boundary — the read-only OFFLINE fallback.
 *
 * The full editor page fires a network call on mount that rejects with no
 * signal and throws here. But editing needs the server anyway (saves are
 * server actions), so offline the right thing is not an error screen — it's
 * a READ-ONLY view of the play, rendered from the cached PlayDocument at the
 * same /plays/<id>/edit URL: the real canonical diagram (PlayDocRender) plus
 * the coaching notes (doc.metadata.notes). Same URL, same renderers, no
 * separate offline surface. Online errors (a genuine bug) still show the
 * normal error UI — we only swap to read-only when the probe confirms we're
 * actually offline AND the play is in the on-device cache.
 */
type Mode = "checking" | "offline" | "error";

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [mode, setMode] = useState<Mode>("checking");
  const [doc, setDoc] = useState<PlayDocument | null>(null);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    Sentry.captureException(error);
    let alive = true;
    void (async () => {
      const match = window.location.pathname.match(/^\/plays\/([^/]+)\/edit/);
      if (!isNativeApp() || !match) {
        if (alive) setMode("error");
        return;
      }
      const playId = match[1]!;
      try {
        const [{ getCachedPlayDocument, getCachedPlay }, online] = await Promise.all([
          import("@/lib/offline/db"),
          probeConnectivity(),
        ]);
        // Only fall back to the read-only cached view when genuinely offline —
        // otherwise an online crash should surface as a real error, not be
        // masked by a stale cached render.
        if (online) {
          if (alive) setMode("error");
          return;
        }
        const [cachedDoc, cachedPlay] = await Promise.all([
          getCachedPlayDocument(playId),
          getCachedPlay(playId),
        ]);
        if (!alive) return;
        if (cachedDoc) {
          setDoc(cachedDoc as PlayDocument);
          setName(cachedPlay?.name ?? "");
          setMode("offline");
        } else {
          setMode("error");
        }
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

  if (mode === "offline" && doc) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span>Back</span>
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-inset px-2.5 py-1 text-[11px] font-medium text-muted">
            <WifiOff className="size-3" />
            Offline · view only
          </span>
        </div>
        {name && <h1 className="text-lg font-bold text-foreground">{name}</h1>}
        <div className="flex justify-center">
          <PlayDocRender doc={doc} />
        </div>
        {doc.metadata?.notes ? (
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <NotesMarkdown
              value={doc.metadata.notes}
              players={doc.layers?.players ?? []}
            />
          </div>
        ) : null}
        <p className="text-center text-xs text-muted">
          Editing is available when you&rsquo;re back online.
        </p>
      </div>
    );
  }

  // Genuine error (online, or nothing cached).
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
