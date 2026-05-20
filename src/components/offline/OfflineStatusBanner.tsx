"use client";

import { WifiOff } from "lucide-react";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { useOfflineState } from "@/lib/offline/useOfflineState";

/**
 * Fixed pill that appears in the native shell when the device is offline.
 * Tells the coach how many downloaded playbooks they can still use. Hidden
 * on web (we don't ship an offline story there yet) and when online.
 *
 * Positioned below the safe-area top inset so it clears the iOS notch
 * without overlapping the status bar.
 *
 * When at least one playbook is downloaded, the pill is a real link to the
 * offline library. Coaches reported tapping the pill and "nothing happens"
 * — it looked like an action chip because of its prominence, so treat it
 * as one.
 */
export function OfflineStatusBanner() {
  const native = useIsNativeApp();
  const { isOnline, downloaded, ready } = useOfflineState();

  if (!native || isOnline) return null;

  const n = downloaded.length;
  const label = !ready
    ? "Offline"
    : n === 0
      ? "Offline · No downloaded playbooks"
      : `Offline · ${n} playbook${n === 1 ? "" : "s"} available`;

  const interactive = ready && n > 0;
  // Use `text-surface` (not `text-background`) — there's no --color-background
  // token, so `text-background` silently falls back to the default text color,
  // making the pill black-on-black in light mode. `bg-foreground` + `text-surface`
  // flips correctly in both themes since both tokens swap with .dark.
  const pillClasses =
    "pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1 text-[11px] font-semibold text-surface shadow-lg backdrop-blur-sm";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      {interactive ? (
        // Use a hard <a> rather than next/link so the SW-cached /offline shell
        // serves cleanly without an RSC round-trip that would fail offline.
        <a href="/offline" aria-label="Open offline library" className={pillClasses}>
          <WifiOff className="size-3" />
          <span>{label}</span>
        </a>
      ) : (
        <div className={pillClasses}>
          <WifiOff className="size-3" />
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
