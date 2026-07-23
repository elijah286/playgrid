/**
 * Single source of truth for playbook / team "accent color" chrome math.
 *
 * Several surfaces render a banner in the team's brand color: the playbook
 * header ({@link file://../../app/(dashboard)/playbooks/[playbookId]/PlaybookHeader.tsx}),
 * the play-editor chrome (EditorPlaybookChrome), the /app team hub
 * (TeamHubChrome), and the live scorecard (ScoreCard). Each used to carry its
 * own copy-pasted luminance + gradient + on-accent-contrast logic — and they
 * had drifted: one used a non-gamma luminance and a 0.6 threshold, so a
 * borderline team color could get white text on one surface and dark text on
 * another. This module is the one place that logic lives.
 *
 * Consumers keep their own DEFAULT/fallback color where the product intent
 * differs (playbook chrome falls back to brand orange; the team hub falls back
 * to green) — only the color *math* is shared, not the choice of default.
 */

/** Default team accent when a playbook hasn't picked one — brand orange. */
export const DEFAULT_PLAYBOOK_ACCENT = "#F26522";

/**
 * WCAG relative luminance (gamma-corrected sRGB) of a `#rrggbb` hex.
 * Returns 0.5 for anything that isn't a 6-digit hex so callers degrade to
 * the "assume mid-tone" branch rather than throwing.
 */
export function hexLuminance(hex: string): number {
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

/**
 * True when the accent is light enough that content on top of it should be
 * dark (near-black) rather than white. 0.55 is the shared threshold.
 */
export function isLightAccent(hex: string): boolean {
  return hexLuminance(hex) > 0.55;
}

/** The 135° accent gradient shared by the playbook + editor banners. */
export function accentGradient(hex: string): string {
  return `linear-gradient(135deg, ${hex} 0%, ${hex}dd 55%, ${hex}a8 100%)`;
}

export type AccentUi = {
  /** True when the accent is light and needs dark text on top. */
  isLightBg: boolean;
  /** Foreground text/icon class for content sitting directly on the accent. */
  onAccent: string;
  /** Muted foreground (subtitles) on the accent. */
  onAccentMuted: string;
  /** Hover-background class for buttons on the accent. */
  onAccentHover: string;
  /** The 135° accent gradient, for `background` / `backgroundImage`. */
  gradient: string;
};

/**
 * Tailwind class bundle for rendering chrome on a given accent color. The
 * exact strings the playbook header and editor chrome previously computed
 * inline — extracted verbatim so the refactor is a no-op visually.
 */
export function accentUi(hex: string): AccentUi {
  const isLightBg = isLightAccent(hex);
  return {
    isLightBg,
    onAccent: isLightBg ? "text-slate-900" : "text-white",
    onAccentMuted: isLightBg ? "text-slate-700" : "text-white/80",
    onAccentHover: isLightBg ? "hover:bg-black/10" : "hover:bg-white/15",
    gradient: accentGradient(hex),
  };
}
