"use client";

import type { ReactNode } from "react";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { useOfflineState } from "@/lib/offline/useOfflineState";

/**
 * Wraps an interactive surface (button, link, menu item) and disables it
 * when the native app is offline. The wrapped child stays mounted so its
 * label / icon still reads correctly; the wrapper intercepts pointer
 * events and dims the visual.
 *
 * Native-only: on web we never disable for offline (web users are assumed
 * online — laptop-loses-wifi is a rare enough case that we'd rather show
 * the live UI and let the underlying action fail visibly).
 *
 * If the consumer needs to know the gated state inline (e.g. to change
 * label copy from "Open" to "Requires connection"), import
 * `useOfflineGate()` instead.
 */
export function OfflineGate({
  children,
  reason = "Requires connection",
  className,
}: {
  children: ReactNode;
  reason?: string;
  className?: string;
}) {
  const { isGated } = useOfflineGate();
  if (!isGated) return <>{children}</>;
  return (
    <span
      className={`relative inline-flex opacity-50 ${className ?? ""}`}
      title={reason}
      aria-disabled="true"
    >
      <span
        aria-hidden="true"
        className="pointer-events-auto absolute inset-0 z-10 cursor-not-allowed"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <span className="pointer-events-none contents">{children}</span>
    </span>
  );
}

/**
 * Hook form of OfflineGate. Returns `isGated: true` when the native app
 * is offline, plus a stable `reason` string for tooltips. Useful when the
 * consumer wants to fork its render (e.g. swap icon, change copy) rather
 * than wrap in a disabled shell.
 */
export function useOfflineGate(): { isGated: boolean; reason: string } {
  const native = useIsNativeApp();
  const { isOnline } = useOfflineState();
  return {
    isGated: native && !isOnline,
    reason: "Requires connection",
  };
}
