"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { hapticImpact, hapticSuccess } from "@/lib/native/haptics";
import { useToast } from "@/components/ui";
import { getPlaybookOfflineBundleAction } from "@/app/actions/offline";
import {
  getCachedPlaybookMeta,
  putPlaybookBundle,
  removeCachedPlaybook,
  type CachedPlaybookMeta,
} from "@/lib/offline/db";

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
  const [meta, setMeta] = useState<CachedPlaybookMeta | null>(null);
  const [busy, setBusy] = useState<"download" | "remove" | null>(null);

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
      setMeta(res.bundle.meta);
      void hapticSuccess();
      toast(
        meta ? "Playbook refreshed for offline." : "Playbook saved for offline.",
        "success",
      );
      onAction?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save offline.";
      toast(msg, "error");
    } finally {
      setBusy(null);
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

  if (!meta) {
    return (
      <button
        type="button"
        role="menuitem"
        disabled={busy != null}
        onClick={handleDownload}
        className={cls}
      >
        {busy === "download" ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <Download className="size-4 shrink-0" />
        )}
        <span>{busy === "download" ? "Downloading…" : "Download for offline"}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={busy != null}
        onClick={handleDownload}
        className={cls}
      >
        {busy === "download" ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <RefreshCw className="size-4 shrink-0" />
        )}
        <span className="flex-1">
          {busy === "download" ? "Refreshing…" : "Refresh offline copy"}
        </span>
        <Check className="size-3.5 shrink-0 text-emerald-500" aria-label="Downloaded" />
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
        <span>Remove offline copy</span>
      </button>
    </>
  );
}
