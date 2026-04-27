import type { SVGProps } from "react";

/**
 * Coach Cal mark — a tilted football with laces + a purple AI sparkle.
 * The football idles at -15° and spins a full 360° every ~4.5 s.
 */
export function CoachAiIcon({ className, ...rest }: SVGProps<SVGSVGElement>) {
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
      <style>{`
        @keyframes coach-cal-spin {
          0%, 65%  { transform: rotate(-15deg); }
          80%      { transform: rotate(345deg); }
          100%     { transform: rotate(345deg); }
        }
        .cc-fb {
          animation: coach-cal-spin 4.5s ease-in-out infinite;
          transform-origin: 12px 12px;
        }
      `}</style>

      {/* ── Animated football ─────────────────────────────────────── */}
      <g className="cc-fb">
        {/* Body — light orange-tan */}
        <ellipse
          cx="12" cy="12" rx="9" ry="5.4"
          fill="#F5A35C"
          stroke="#C96830"
          strokeWidth="0.5"
        />
        {/* Seam arc */}
        <path
          d="M3 12 C6.5 9 17.5 9 21 12"
          stroke="#C96830"
          strokeWidth="1"
          fill="none"
        />
        {/* Laces — white */}
        <line x1="10.4" y1="10.1" x2="10.4" y2="13.9" stroke="white" strokeWidth="1.25"/>
        <line x1="12"   y1="9.6"  x2="12"   y2="14.4" stroke="white" strokeWidth="1.25"/>
        <line x1="13.6" y1="10.1" x2="13.6" y2="13.9" stroke="white" strokeWidth="1.25"/>
        {/* Horizontal lace bar */}
        <line x1="10.1" y1="12" x2="13.9" y2="12" stroke="white" strokeWidth="1"/>
      </g>

      {/* ── AI sparkle — static, top-right ───────────────────────── */}
      <path
        d="M19.5 1.8 L20.15 3.65 L22 4.3 L20.15 4.95 L19.5 6.8 L18.85 4.95 L17 4.3 L18.85 3.65Z"
        fill="#a78bfa"
      />
      <circle cx="16.8" cy="2.1" r="0.58" fill="#c4b5fd"/>
      <circle cx="21.8" cy="7.1" r="0.48" fill="#c4b5fd"/>
    </svg>
  );
}
