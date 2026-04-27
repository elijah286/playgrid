import type { SVGProps } from "react";

/**
 * Coach AI mark — a brown football with seam + laces, and a four-point
 * purple AI sparkle breaking out of the top-right.
 */
export function CoachAiIcon({
  className,
  ...rest
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* Football body — brown fill */}
      <path
        d="M4 12 C5.5 7 18.5 7 20 12 C18.5 17 5.5 17 4 12Z"
        fill="#7C3B10"
        stroke="#5C2A0A"
        strokeWidth={0.6}
      />
      {/* Seam */}
      <path
        d="M4 12 C8 9.5 16 9.5 20 12"
        stroke="#5C2A0A"
        strokeWidth={1.1}
        fill="none"
      />
      {/* Laces — white */}
      <line x1="11"   y1="10.4" x2="11"   y2="13.6" stroke="white" strokeWidth={1.3} />
      <line x1="12.5" y1="10.0" x2="12.5" y2="14.0" stroke="white" strokeWidth={1.3} />
      <line x1="14"   y1="10.4" x2="14"   y2="13.6" stroke="white" strokeWidth={1.3} />
      {/* Horizontal lace bar */}
      <line x1="10.6" y1="12" x2="14.4" y2="12" stroke="white" strokeWidth={1} />

      {/* AI sparkle — four-point star, purple */}
      <path
        d="M19.5 2.5 L20.1 4.4 L22 5 L20.1 5.6 L19.5 7.5 L18.9 5.6 L17 5 L18.9 4.4Z"
        fill="#a855f7"
        stroke="#9333ea"
        strokeWidth={0.7}
      />
      {/* Glint dots */}
      <circle cx="16" cy="2.8" r="0.6" fill="#c084fc" />
      <circle cx="22" cy="8"   r="0.5" fill="#c084fc" />
    </svg>
  );
}
