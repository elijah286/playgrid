"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
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
import { EditorPlaybookChrome } from "@/features/editor/EditorPlaybookChrome";

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
type Mode = "checking" | "offline" | "notDownloaded" | "error";

type PlaybookChrome = {
  id: string;
  name: string;
  color: string;
  logo: string | null;
  season: string | null;
  variant: string;
  owner: string | null;
};

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
              // Only the inlined logo — the remote URL is dead offline (a plain
              // <img src=deadUrl> would render a broken-image "?"). Null falls
              // back to the playbook initial in EditorPlaybookChrome.
              setBook({
                id: meta.id,
                name: meta.name,
                color: meta.color,
                logo: meta.logoDataUrl,
                season: meta.season,
                variant: meta.sportVariant,
                owner: meta.ownerLabel,
              });
            }
          }
          setMode("offline");
        } else {
          // Offline and this play was never downloaded — a friendly, honest
          // message beats "Something went wrong."
          setMode("notDownloaded");
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 pb-24 sm:pb-6">
        {/* The SAME playbook chrome the online editor renders (offline mode:
            inlined logo, "Offline" marker instead of the inbox bell) so the
            header is identical online and off. */}
        <EditorPlaybookChrome
          offline
          playbookId={book?.id ?? ""}
          playbookName={book?.name ?? "Playbook"}
          playbookColor={book?.color ?? null}
          playbookLogoUrl={book?.logo ?? null}
          playbookSeason={book?.season}
          playbookVariant={book?.variant}
          playbookOwnerName={book?.owner}
        />

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

  if (mode === "notDownloaded") {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <WifiOff className="mx-auto size-8 text-muted" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">
          This play isn&rsquo;t downloaded
        </h1>
        <p className="mt-2 text-sm text-muted">
          Open its playbook while you&rsquo;re online and tap
          &ldquo;Available offline&rdquo; to keep every play on this device for
          the sideline.
        </p>
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>
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
