"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

/**
 * Mobile-only slim chrome for the play editor — mirrors the orange
 * playbook banner that's shown on the playbook detail page so the user
 * doesn't lose context when they tap into a play. Replaces the SiteHeader
 * (which is hidden on mobile editor via `editor-hide-site-header`).
 *
 * Just the essentials: back arrow, playbook initial/avatar, playbook
 * name. Cal lives in the bottom nav so it has a single home (and the
 * top stays free for navigation context). Full PlaybookHeader actions
 * (share, kebab) stay scoped to the playbook page itself.
 */
export function EditorPlaybookChrome({
  playbookId,
  playbookName,
  playbookColor,
  playbookLogoUrl,
}: {
  playbookId: string;
  playbookName: string | null;
  /** Hex color (e.g. "#F26522"). Falls back to brand orange. */
  playbookColor: string | null;
  /** Team logo URL. Falls back to the playbook initial when null. */
  playbookLogoUrl: string | null;
}) {
  const accentColor = playbookColor || "#F26522";
  const isLightBg = hexLuminance(accentColor) > 0.55;
  const onAccent = isLightBg ? "text-slate-900" : "text-white";
  const onAccentHover = isLightBg ? "hover:bg-black/10" : "hover:bg-white/15";
  const gradient = `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 55%, ${accentColor}a8 100%)`;
  const initial = (playbookName ?? "P").trim().charAt(0).toUpperCase();
  return (
    <div
      // -mx-6 -mt-5 escapes the editor layout's px-6 py-5 padding so the
      // banner bleeds edge-to-edge like the playbook page's banner.
      // backgroundColor is set explicitly under backgroundImage so the
      // gradient's alpha steps don't let content scroll-through. The
      // playbook page's chrome avoids this because it sits inside a
      // `bg-surface` wrapper; the editor doesn't have that backdrop.
      className="sticky top-0 z-30 -mx-6 -mt-5 sm:hidden"
      style={{ backgroundImage: gradient, backgroundColor: accentColor }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <Link
          href={`/playbooks/${playbookId}`}
          className={`-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${onAccent} ${onAccentHover}`}
          aria-label="Back to playbook"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div
          className={`relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-base font-extrabold ring-1 ${
            isLightBg ? "bg-white/80 ring-black/10" : "bg-white/20 ring-white/30"
          } ${onAccent}`}
        >
          {playbookLogoUrl ? (
            <Image
              src={playbookLogoUrl}
              alt=""
              fill
              className="object-contain p-1"
              sizes="36px"
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <h1
          className={`min-w-0 flex-1 truncate text-base font-extrabold tracking-tight ${onAccent}`}
        >
          {playbookName || "Playbook"}
        </h1>
      </div>
    </div>
  );
}

function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const toLin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}
