import type { SVGProps } from "react";

type CoachAiIconProps = SVGProps<SVGSVGElement> & {
  /**
   * When true, render only the sparkle/dot foreground (no gradient tile
   * background). Use inside parent containers that already provide a
   * colored backdrop — e.g. the chat header's training-mode tiles or
   * a circular avatar with a tinted background.
   * Default false: full standalone mark with the brand-gradient tile.
   */
  bare?: boolean;
};

/**
 * Coach Cal mark — a 4-point AI sparkle on a brand-gradient rounded tile.
 *
 * Design rationale:
 *   - Square aspect ratio (was ~1.28:1) so it doesn't visually shrink to
 *     "coffee-cup proportions" on mobile / in the header.
 *   - Sparkle = the universal AI shorthand (Gemini, Copilot, Notion AI all
 *     use the same 4-point star). Reads as AI even at 24px.
 *   - Brand gradient (primary blue → indigo → brand orange) keeps it
 *     consistent with the rest of the site's palette.
 *   - A small green accent dot nods to the brand's third color and adds
 *     a "magic-motion" off-axis sparkle so the mark doesn't feel static.
 *
 * Use it the same way as before — sized via `className` (h-N w-N), no
 * intrinsic colors needed; everything is baked in via gradients and
 * fixed brand hex values so the mark looks identical in light + dark
 * themes and on any background. Pass `bare` when nesting inside an
 * existing colored tile to drop the gradient backdrop.
 */
export function CoachAiIcon({ className, bare = false, ...rest }: CoachAiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {!bare && (
        <defs>
          {/* Tile gradient — primary blue → brand orange diagonally. Matches
           *  the brand palette in src/app/globals.css. */}
          <linearGradient id="cal-tile-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1769FF" />
            <stop offset="55%" stopColor="#5B47E0" />
            <stop offset="100%" stopColor="#F26522" />
          </linearGradient>
          {/* Subtle inner highlight so the tile reads as a soft 3D surface
           *  rather than a flat rectangle. */}
          <radialGradient id="cal-tile-shine" cx="22%" cy="18%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}

      {!bare && (
        <>
          {/* Tile background — rounded square with the gradient + shine overlay. */}
          <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#cal-tile-grad)" />
          <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#cal-tile-shine)" />
        </>
      )}

      {/* Primary 4-point sparkle — the AI signal. Centered, with elongated
       *  points so it reads as a "sparkle" not a "plus sign". When bare,
       *  inherits currentColor so the parent can theme it; otherwise white
       *  on the gradient tile. */}
      <path
        d="M32 12 L34.6 27.4 L50 32 L34.6 36.6 L32 52 L29.4 36.6 L14 32 L29.4 27.4 Z"
        fill={bare ? "currentColor" : "#FFFFFF"}
      />

      {/* Secondary off-axis sparkle — adds the "magic motion" feel that
       *  distinguishes an AI mark from a generic star icon. */}
      <path
        d="M48 14 L49.2 19.6 L54.5 21 L49.2 22.4 L48 28 L46.8 22.4 L41.5 21 L46.8 19.6 Z"
        fill={bare ? "currentColor" : "#FFFFFF"}
        opacity={bare ? 0.7 : 0.92}
      />

      {/* Brand-green accent dot — third brand color, sits opposite the
       *  secondary sparkle for visual balance. Hidden in bare mode (it
       *  fights with whatever color the parent tile is using). */}
      {!bare && <circle cx="16" cy="48" r="3.2" fill="#95CC1F" />}
    </svg>
  );
}
