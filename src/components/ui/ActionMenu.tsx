"use client";

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionMenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
};

/**
 * Small ⋯ popover menu. Positions itself below-right of its trigger.
 * Not a full a11y combobox — keep it scoped to card actions.
 */
export function ActionMenu({
  items,
  label = "More actions",
  className,
  open: openProp,
  onOpenChange,
}: {
  items: ActionMenuItem[];
  label?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(open) : next;
    if (openProp === undefined) setOpenInternal(resolved);
    onOpenChange?.(resolved);
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    right: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    // Position the portaled menu in viewport coords, kept fully on-screen.
    // Open below the trigger, but flip ABOVE when there isn't room below —
    // the case that cropped the menu on lower rows in the native app, where
    // the bottom nav + safe area eat vertical space. Clamp to the visual
    // viewport and cap the height with a scroll fallback so it can never be
    // cut off. Two passes (a rAF after mount) so we can measure the menu's
    // real height before deciding to flip.
    function place() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const gap = 4;
      const margin = 8;
      const vv = window.visualViewport;
      const viewTop = vv?.offsetTop ?? 0;
      const viewHeight = vv?.height ?? window.innerHeight;
      const viewBottom = viewTop + viewHeight;
      const menuH = popoverRef.current?.offsetHeight ?? 0;
      const spaceBelow = viewBottom - r.bottom - gap - margin;
      const spaceAbove = r.top - viewTop - gap - margin;
      const openUp = menuH > spaceBelow && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        96,
        Math.round(openUp ? spaceAbove : spaceBelow),
      );
      const top = openUp
        ? Math.max(
            viewTop + margin,
            Math.round(r.top - gap - Math.min(menuH, maxHeight)),
          )
        : Math.round(r.bottom + gap);
      setPos({
        top,
        right: Math.max(margin, Math.round(window.innerWidth - r.right)),
        maxHeight,
      });
    }
    place();
    // Re-place after the menu mounts so its measured height drives the flip.
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
      >
        <MoreVertical className="size-4" />
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              maxHeight: pos.maxHeight,
            }}
            className="z-50 min-w-[160px] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    item.danger
                      ? "text-danger hover:bg-danger-light"
                      : "text-foreground hover:bg-surface-inset",
                  )}
                >
                  {Icon && <Icon className="size-4 shrink-0" />}
                  <span className="flex-1">{item.label}</span>
                  {item.trailing != null && (
                    <span className="ml-2 shrink-0">{item.trailing}</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
