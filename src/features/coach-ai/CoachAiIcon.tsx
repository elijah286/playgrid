import type { SVGProps } from "react";

/**
 * Coach AI mark — a stylized coach's whistle with a sparkle.
 * Whistle = "Coach"; sparkle = "AI". Stroke-only so it inherits currentColor.
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
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* whistle body */}
      <path d="M4.5 11a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0Z" />
      {/* mouthpiece */}
      <path d="M13 9.5l5.5-2.2a1 1 0 0 1 1.37 1.16l-1.1 4.6a1 1 0 0 1-1.55.6L13 11.6" />
      {/* lanyard ring */}
      <circle cx="9" cy="11" r="0.9" />
      {/* sparkle (AI) */}
      <path d="M18.5 16.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6Z" />
    </svg>
  );
}
