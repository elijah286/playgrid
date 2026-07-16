"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import { Button } from "@/components/ui";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { probeConnectivity } from "@/lib/offline/connectivity";
import { PlayDocRender } from "@/features/coach-ai/PlayDiagramEmbed";
import { NotesMarkdown } from "@/features/editor/NotesMarkdown";

/**
 * Editor segment error boundary — the read-only OFFLINE view.
 *
 * The full editor page fires a network call on mount that rejects with no
 * signal and throws here. Editing needs the server anyway (saves are server
 * actions), so offline the right thing is not an error screen — it's the
 * editor rendered READ-ONLY: the same playbook header, the same canonical
 * field (PlayDocRender), the same notes, and the editor's bottom toolbar
 * shown but GREYED OUT. Since offline is read-only, a greyed editor shell is
 * functionally identical to "the real editor, read-only" — and it keeps the
 * offline experience indistinguishable from online without forcing the heavy
 * editor to mount without a network (the risky path). Online errors (a genuine
 * bug) still show the normal error UI — we only swap to the read-only shell
 * when the probe confirms we're actually offline AND the play is cached.
 */
type Mode = "checking" | "offline" | "error";

type PlaybookChrome = { name: string; logoUrl: string | null; color: string };

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
  const [book, setBook] = useState<PlaybookChrome | null>(null);

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
        const [
          { getCachedPlayDocument, getCachedPlay, getCachedPlaybookMeta },
          online,
        ] = await Promise.all([import("@/lib/offline/db"), probeConnectivity()]);
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
          // Playbook chrome for the header (best-effort — the diagram + notes
          // render regardless of whether the playbook meta is cached).
          if (cachedPlay?.playbookId) {
            const meta = await getCachedPlaybookMeta(cachedPlay.playbookId).catch(
              () => null,
            );
            if (alive && meta) {
              setBook({ name: meta.name, logoUrl: meta.logoUrl, color: meta.color });
            }
          }
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
    const color = book?.color || "#F26522";
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 pb-24 sm:pb-6">
        {/* Playbook header — mirrors the editor's mobile chrome so the offline
            view has the same top bar (not a bare back button merged into the
            iOS status bar). Back sits in the bar; the offline state is marked
            on the right. */}
        <div className="sticky top-0 z-30 -mx-6 bg-surface px-6 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div
            className="-mx-6 flex items-center gap-2 px-4 py-3"
            style={{ backgroundColor: color }}
          >
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label="Back"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/15"
            >
              <ArrowLeft className="size-5" />
            </button>
            {book?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.logoUrl}
                alt=""
                className="size-9 shrink-0 rounded-lg bg-white/10 object-contain"
              />
            ) : book ? (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-sm font-bold text-white">
                {(book.name[0] ?? "?").toUpperCase()}
              </div>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-base font-bold text-white">
              {book?.name ?? "Playbook"}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/20 px-2 py-1 text-[11px] font-semibold text-white">
              <WifiOff className="size-3" />
              Offline
            </span>
          </div>
        </div>

        {/* Play name */}
        {name && (
          <h1 className="px-4 pt-1 text-lg font-bold text-foreground">{name}</h1>
        )}

        {/* Field — fills the width like the online editor canvas. */}
        <div className="px-2">
          <PlayDocRender doc={doc} />
        </div>

        {/* Coaching notes — same source + renderer as online. */}
        {doc.metadata?.notes ? (
          <div className="mx-4 rounded-xl border border-border bg-surface-raised p-3">
            <NotesMarkdown
              value={doc.metadata.notes}
              players={doc.layers?.players ?? []}
            />
          </div>
        ) : null}

        {/* Editor toolbar — shown but GREYED OUT (non-interactive). Mirrors the
            real EditorBottomNav's label set so the shell reads as the editor;
            offline is read-only, so the actions are disabled with a hint. */}
        <nav
          aria-label="Editing is available online"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface-raised opacity-50"
          title="Editing is available when you're back online"
          style={{
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
          }}
        >
          <GreyNavItem label="Plays" Icon={ListChecks} />
          <GreyNavItem label="Chat" Icon={MessageCircle} />
          <GreyNavItem label="Calendar" Icon={Calendar} />
          <GreyNavItem label="More" Icon={MoreHorizontal} />
        </nav>
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

/** Greyed, non-interactive toolbar item — a read-only echo of EditorBottomNav. */
function GreyNavItem({ label, Icon }: { label: string; Icon: React.ElementType }) {
  return (
    <div
      aria-disabled="true"
      className="flex min-h-[48px] flex-1 cursor-not-allowed flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight text-muted"
    >
      <Icon className="size-5" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}
