"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { setUxPreviewActiveAction } from "@/app/actions/ux-preview";

/**
 * Slim, always-reachable ribbon for users who are ALLOWED to preview the new
 * UX (site admins, or accounts on the `new_shell` allowlist). It is the
 * everywhere-accessible flip between Production and the new-UX scaffold, so an
 * allowlisted non-admin (who can't reach Site Admin) can still turn it on/off.
 *
 * Rendered by the root layout only when `resolveUxPreview().allowed` is true —
 * so it is invisible to every other user. `active` reflects the per-session
 * cookie; production users never see this at all.
 */
export function UxPreviewRibbon({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Publish the ribbon's height so the new-UX shell can bound itself to the
  // remaining viewport (height: calc(100dvh - var(--ux-ribbon-h))) — a fixed
  // frame where only the main content scrolls. Inert on production (nothing
  // reads the var there).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--ux-ribbon-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--ux-ribbon-h");
    };
  }, []);

  const toggle = () => {
    const next = !active;
    startTransition(async () => {
      await setUxPreviewActiveAction(next);
      // Enter the new shell on turn-on; return to the production home on
      // turn-off (the /app gate would bounce there anyway once inactive).
      router.push(next ? "/app/home" : "/home");
    });
  };

  return (
    <div
      ref={ref}
      role="status"
      data-ux-ribbon
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-center text-xs font-semibold ${
        active
          ? "bg-brand-orange text-white"
          : "bg-brand-orange-light text-brand-orange"
      }`}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {active ? "New UX preview" : "New UX — early access"}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-busy={pending || undefined}
        className={`ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
          active
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-brand-orange text-white hover:bg-brand-orange-hover"
        }`}
      >
        {pending && <Loader2 className="size-3 animate-spin" aria-hidden />}
        {active ? "Back to Production" : "Turn on"}
      </button>
    </div>
  );
}
