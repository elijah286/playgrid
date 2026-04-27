import type { SVGProps } from "react";

/**
 * Coach AI mark — a horizontal football with seam + laces, and a four-point
 * AI sparkle breaking out of the top-right.
 *
 * Stroke-only so it inherits currentColor at any size.
 */
export function CoachAiIcon({
  className,
  ...rest
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* Football body */}
      <path
        d="M4 12 C5.5 7 18.5 7 20 12 C18.5 17 5.5 17 4 12Z"
        strokeWidth={1.6}
      />
      {/* Long seam — arcs from tip to tip over the top */}
      <path
        d="M4 12 C8 9.5 16 9.5 20 12"
        strokeWidth={1.4}
      />
      {/* Laces — three short perpendicular bars */}
      <line x1="11"   y1="10.2" x2="11"   y2="13.8" strokeWidth={1.4} />
      <line x1="12.5" y1="9.8"  x2="12.5" y2="14.2" strokeWidth={1.4} />
      <line x1="14"   y1="10.2" x2="14"   y2="13.8" strokeWidth={1.4} />

      {/* AI sparkle — four-point star breaking from top-right */}
      <path
        d="M19.5 2.5 L20.1 4.4 L22 5 L20.1 5.6 L19.5 7.5 L18.9 5.6 L17 5 L18.9 4.4Z"
        strokeWidth={1.3}
      />
      {/* Tiny glint dots around sparkle for magic feel */}
      <circle cx="16" cy="2.8" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="22" cy="8"   r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
