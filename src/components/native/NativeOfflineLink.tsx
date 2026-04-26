"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { listCachedPlaybooks } from "@/lib/offline/db";

/**
 * Floating "Offline" pill, native-only. Always visible inside the app so
 * a coach with no signal (and an Apple/Play reviewer poking around) can
 * always reach their downloaded playbooks.
 *
 * Suppressed on the offline routes themselves and on focused-work flows
 * (editor, game mode, print) where a floating chip would compete with
 * canvas chrome. The dashboard FeedbackWidget pins to bottom-right, so
 * we anchor to bottom-left to stay out of its way.
 */
export function NativeOfflineLink() {
  const native = useIsNativeApp();
  const pathname = usePathname() ?? "";
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!native) return;
    let alive = true;
    void listCachedPlaybooks()
      .then((rows) => {
        if (alive) setCount(rows.length);
      })
      .catch(() => {
        if (alive) setCount(0);
      });
    return () => {
      alive = false;
    };
  }, [native, pathname]);

  if (!native) return null;
  if (pathname.startsWith("/offline")) return null;
  if (
    /\/(plays|formations)\/[^/]+\/edit/.test(pathname) ||
    /\/playbooks\/[^/]+\/(game|print)/.test(pathname)
  ) {
    return null;
  }

  return (
    <Link
      href="/offline"
      aria-label={
        count && count > 0
          ? `Offline playbooks (${count} downloaded)`
          : "Offline playbooks"
      }
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-3 py-2 text-xs font-medium text-foreground shadow-elevated ring-1 ring-border hover:bg-surface-inset"
    >
      <Download className="size-3.5" />
      <span>Offline</span>
      {count !== null && count > 0 && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
