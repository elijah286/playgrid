"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

/**
 * Slim chrome banner for the play editor — mirrors the colored playbook
 * banner on the playbook detail page so the user keeps the team's visual
 * identity (logo + color + name + season subtitle) while editing a play.
 *
 * Renders on both mobile and desktop. Sticky-and-z-elevated on mobile
 * (where it stands in for the hidden SiteHeader) and static-positioned
 * on desktop (z-auto so it doesn't fight the SiteHeader's z-index — it
 * just scrolls away with the page). Just the essentials: back arrow,
 * playbook avatar, name, subtitle.
 */
export function EditorPlaybookChrome({
  playbookId,
  playbookName,
  playbookColor,
  playbookLogoUrl,
  playbookSeason,
  playbookVariant,
  playbookOwnerName,
}: {
  playbookId: string;
  playbookName: string | null;
  /** Hex color (e.g. "#F26522"). Falls back to brand orange. */
  playbookColor: string | null;
  /** Team logo URL. Falls back to the playbook initial when null. */
  playbookLogoUrl: string | null;
  /** Season label, e.g. "Spring 2026". Shown in the subtitle. */
  playbookSeason?: string | null;
  /** SportVariant id (flag_5v5, tackle_11, …). Resolved to a human label. */
  playbookVariant?: string | null;
  /** Owner display name shown in the subtitle. */
  playbookOwnerName?: string | null;
}) {
  const accentColor = playbookColor || "#F26522";
  const isLightBg = hexLuminance(accentColor) > 0.55;
  const onAccent = isLightBg ? "text-slate-900" : "text-white";
  const onAccentMuted = isLightBg ? "text-slate-700" : "text-white/80";
  const onAccentHover = isLightBg ? "hover:bg-black/10" : "hover:bg-white/15";
  const gradient = `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 55%, ${accentColor}a8 100%)`;
  const initial = (playbookName ?? "P").trim().charAt(0).toUpperCase();
  const variantLabel =
    playbookVariant && playbookVariant in SPORT_VARIANT_LABELS
      ? SPORT_VARIANT_LABELS[playbookVariant as SportVariant]
      : null;
  const subtitle = [
    playbookSeason?.trim() || null,
    variantLabel,
    playbookOwnerName?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      // Outer sticky wrapper on mobile — bg-surface with pt-3/pb-3
      // produces a 12px dark frame above and below the gradient. The
      // visible dark strip above is what the user sees as "black above
      // the banner" on the playbook list. `-mx-6` bleeds horizontally
      // through the editor layout's px-6.
      //
      // The lift to main-top lives on `play-editor-content` (the parent)
      // via `-mt-5` — same trick the playbook list uses with -mt-8 on
      // its outer wrapper. We deliberately do NOT put a negative margin
      // on the sticky element itself: iOS Safari's sticky+negative-mt
      // combo has scroll-jank where the element's effective height
      // changes between scrolled and un-scrolled states.
      //
      // Desktop drops the sticky + dark frame: gradient sits at main
      // top, below the SiteHeader. We also drop z-30 so the banner
      // doesn't fight the SiteHeader's stacking as the page scrolls.
      className="native-safe-top sticky top-0 z-30 -mx-6 bg-surface px-6 pb-3 pt-3 sm:static sm:z-auto sm:-mt-5 sm:bg-transparent sm:p-0"
    >
    <div
      className="-mx-6 sm:mx-0"
      style={{ backgroundImage: gradient, backgroundColor: accentColor }}
    >
      <div className="flex items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        {/* Mobile: icon-only back arrow. Desktop: "Back" text link. */}
        <Link
          href={`/playbooks/${playbookId}`}
          className={`-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors sm:hidden ${onAccent} ${onAccentHover}`}
          aria-label="Back to playbook"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Link
          href={`/playbooks/${playbookId}`}
          className={`hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors sm:inline-flex ${onAccentMuted} ${onAccentHover}`}
          aria-label="Back to playbook"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <div
          className={`hidden h-6 w-px sm:block ${
            isLightBg ? "bg-black/20" : "bg-white/25"
          }`}
        />
        <div
          className={`relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-base font-extrabold ring-1 sm:size-11 sm:rounded-xl sm:text-lg ${
            isLightBg ? "bg-white/80 ring-black/10" : "bg-white/20 ring-white/30"
          } ${onAccent}`}
        >
          {playbookLogoUrl ? (
            <Image
              src={playbookLogoUrl}
              alt=""
              fill
              className="object-contain p-1"
              sizes="44px"
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className={`truncate text-base font-extrabold tracking-tight sm:text-2xl ${onAccent}`}
          >
            {playbookName || "Playbook"}
          </h1>
          {subtitle && (
            <p
              className={`truncate text-[11px] font-medium sm:text-sm ${onAccentMuted}`}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
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
