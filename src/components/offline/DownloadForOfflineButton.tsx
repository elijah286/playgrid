"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { hapticImpact, hapticSuccess } from "@/lib/native/haptics";
import { useToast } from "@/components/ui";
import { getPlaybookOfflineBundleAction } from "@/app/actions/offline";
import { precacheUrls } from "@/lib/native/registerServiceWorker";
import {
  getCachedPlaybookMeta,
  putPlaybookBundle,
  removeCachedPlaybook,
  type CachedPlaybookMeta,
} from "@/lib/offline/db";
import { useOfflineGate } from "./OfflineGate";

type Props = {
  playbookId: string;
  /** Optional className applied to the menu-item-style button. */
  className?: string;
  /** Called after a successful download/refresh/remove so the host menu can close. */
  onAction?: () => void;
};

/**
 * Native-only menu item that downloads a playbook into IndexedDB so the
 * Capacitor app can open it without network. Hidden on web — there's no
 * coach value to a desktop "download for offline" affordance, and showing
 * it would muddy the marketing story.
 */
export function DownloadForOfflineButton({ playbookId, className, onAction }: Props) {
  const native = useIsNativeApp();
  const { toast } = useToast();
  const { isGated: offline, reason: offlineReason } = useOfflineGate();
  const [meta, setMeta] = useState<CachedPlaybookMeta | null>(null);
  const [busy, setBusy] = useState<"download" | "remove" | null>(null);
  /** Page-precache progress (0–100) while a download is in flight, else null.
   *  The bundle write is fast; fetching one page per play is the slow part, and
   *  it used to run invisibly AFTER the button already said "Available
   *  offline". */
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!native) return;
    let alive = true;
    void getCachedPlaybookMeta(playbookId)
      .then((m) => {
        if (alive) setMeta(m);
      })
      .catch(() => {
        /* ignore — cache simply absent */
      });
    return () => {
      alive = false;
    };
  }, [native, playbookId]);

  if (!native) return null;

  async function handleDownload() {
    if (busy) return;
    setBusy("download");
    void hapticImpact("light");
    try {
      const res = await getPlaybookOfflineBundleAction(playbookId);
      if (!res.ok) {
        toast(res.error || "Couldn't download playbook.", "error");
        return;
      }
      await putPlaybookBundle({
        meta: res.bundle.meta,
        plays: res.bundle.plays,
        documents: res.bundle.documents,
      });
      // Prime the SW cache with the REAL app routes so they load offline —
      // the playbook page and every play's editor (HTML + RSC + chunks). No
      // separate offline surface: the coach navigates the standard pages
      // without signal. Without this the data is in IndexedDB but the pages
      // that render it were never fetched, so offline visits stall.
      //
      // AWAIT it (with progress) rather than fire-and-forget: this is one fetch
      // per play, and it used to run invisibly after we'd already told the coach
      // "Available offline" — who then tapped a play that wouldn't open. The
      // copy isn't done until the pages are down.
      const wasUpdate = meta != null;
      setProgress(0);
      await precacheUrls(
        [
          `/playbooks/${playbookId}`,
          ...res.bundle.plays.map((p) => `/plays/${p.id}/edit`),
        ],
        {
          onProgress: ({ done, total }) =>
            setProgress(total > 0 ? Math.round((done / total) * 100) : 100),
        },
      );
      setMeta(res.bundle.meta);
      void hapticSuccess();
      toast(
        wasUpdate ? "Offline copy updated." : "Now available offline on this device.",
        "success",
      );
      onAction?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save offline.";
      toast(msg, "error");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function handleRemove() {
    if (busy) return;
    setBusy("remove");
    void hapticImpact("light");
    try {
      await removeCachedPlaybook(playbookId);
      setMeta(null);
      toast("Removed from offline.", "success");
      onAction?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't remove.";
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  const cls =
    className ??
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset disabled:opacity-50";

  // Honest progress copy: percentage once the pages start landing, a generic
  // label only for the brief data-fetch before the first tick.
  const downloadingLabel =
    progress != null ? `Downloading ${progress}%` : "Saving for offline…";

  if (!meta) {
    return (
      <button
        type="button"
        role="menuitem"
        disabled={busy != null || offline}
        onClick={handleDownload}
        title={offline ? offlineReason : undefined}
        className={cls}
      >
        {busy === "download" ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <Download className="size-4 shrink-0" />
        )}
        <span>{busy === "download" ? downloadingLabel : "Make available offline"}</span>
      </button>
    );
  }

  return (
    <>
      {/* Persistent status: this playbook is kept on THIS device and refreshed
          automatically in the background. Non-interactive — the actions below
          manage it. */}
      <div className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        <Check className="size-4 shrink-0" />
        <span className="flex-1 font-medium">Available offline</span>
        {busy === "download" && (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />
        )}
      </div>
      <button
        type="button"
        role="menuitem"
        disabled={busy != null || offline}
        onClick={handleDownload}
        title={offline ? offlineReason : "Kept up to date automatically — tap to update now"}
        className={cls}
      >
        <RefreshCw className="size-4 shrink-0" />
        <span>{busy === "download" ? downloadingLabel : "Update now"}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy != null}
        onClick={handleRemove}
        className={cls}
      >
        {busy === "remove" ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <Trash2 className="size-4 shrink-0" />
        )}
        <span>Remove from offline</span>
      </button>
    </>
  );
}
