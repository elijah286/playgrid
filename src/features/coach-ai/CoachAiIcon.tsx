import type { SVGProps } from "react";

/**
 * Coach AI mark — a simplified aerial play-diagram view.
 *
 * Three circles = players on the line of scrimmage (formation).
 * Two curved routes going outward and upfield = play concept.
 * Four-point sparkle at top = AI.
 *
 * Immediately connects to the app's own play-diagram visual language.
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
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* Line-of-scrimmage players */}
      <circle cx="6"  cy="17" r="2" />
      <circle cx="12" cy="17" r="2" />
      <circle cx="18" cy="17" r="2" />

      {/* Left route — curl out to the flat */}
      <path d="M6 15 C 6 11, 3 9, 3 6" />
      <polyline points="1.5,7.5 3,6 4.5,7.5" />

      {/* Right route — fly / go route */}
      <path d="M18 15 C 18 11, 21 9, 21 6" />
      <polyline points="19.5,7.5 21,6 22.5,7.5" />

      {/* AI sparkle — four-point star above center */}
      <path d="M12 3 L12.55 4.7 L14.25 5.25 L12.55 5.8 L12 7.5 L11.45 5.8 L9.75 5.25 L11.45 4.7Z" />
    </svg>
  );
}
