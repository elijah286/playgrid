"use client";

import { useTransition } from "react";
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
      role="status"
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-center text-xs font-semibold ${
        active
          ? "bg-brand-orange text-white"
          : "bg-brand-orange-light text-brand-orange"
      }`}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {active
          ? "New UX preview is ON — a scaffold; production is unaffected for everyone else."
          : "You have early access to the new UX preview."}
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
