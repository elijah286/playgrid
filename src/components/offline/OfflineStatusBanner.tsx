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

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1 text-[11px] font-semibold text-background shadow-lg backdrop-blur-sm">
        <WifiOff className="size-3" />
        <span>{label}</span>
      </div>
    </div>
  );
}
