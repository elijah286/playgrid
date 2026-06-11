"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { getResourceItems } from "./ResourcesDropdown";
import { FeedbackTrigger } from "@/components/feedback/FeedbackTrigger";

type Props = {
  /** Anonymous mobile users get Pricing + a Get-started CTA inside the
   *  sheet — those are the funnel destinations the marketing pages lean
   *  on. Authed users see Resources only; their primary nav (Playbooks,
   *  Calendar, Cal, Inbox, Account) lives in `HomeBottomNav`, so the
   *  hamburger is purely a Resources side-door for them. */
  authed: boolean;
  footballLibraryAvailable?: boolean;
  feedbackEnabled?: boolean;
};

/**
 * Mobile-only hamburger that opens a right-side slide-in sheet. Holds
 * the same items the desktop [[ResourcesDropdown]] surfaces (via
 * [[getResourceItems]] so they stay in lockstep), plus marketing CTAs
 * for anonymous visitors.
 *
 * Hidden ≥sm — the desktop header has space for the full nav row.
 *
 * Portals into document.body — the SiteHeader's `backdrop-blur-lg`
 * creates a containing block for `position:fixed` descendants, so an
 * in-tree sheet would clip to the header height instead of the viewport.
 */
export function MobileNavMenu({ authed, footballLibraryAvailable = false, feedbackEnabled = false }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const items = getResourceItems(footballLibraryAvailable);

  // Portal target needs to exist on the client only. Without this guard
  // the SSR pass would call `createPortal` against an undefined
  // `document` and throw.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {open && mounted && createPortal(
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-150 sm:hidden"
          />
          <div
            role="dialog"
            aria-label="Site navigation"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col border-l border-border bg-surface-raised shadow-2xl animate-in slide-in-from-right duration-200 sm:hidden"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Resources
              </div>
              <ul className="mb-2">
                {items.map((it) => {
                  const active = pathname.startsWith(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        onClick={() => setOpen(false)}
                        className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? "bg-primary-light/40 text-foreground"
                            : "text-foreground hover:bg-surface-inset"
                        }`}
                      >
                        <div className="font-medium">{it.label}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          {it.description}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {!authed && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <Link
                    href="/pricing"
                    data-web-only
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-inset"
                  >
                    Pricing
                  </Link>
                </>
              )}

              {feedbackEnabled && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <FeedbackTrigger
                    variant="sheet"
                    onClick={() => setOpen(false)}
                  />
                </>
              )}
            </nav>

            {!authed && (
              <div className="border-t border-border p-3">
                <Link
                  href="/login?mode=signup"
                  onClick={() => setOpen(false)}
                  className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
                >
                  Get started
                </Link>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
