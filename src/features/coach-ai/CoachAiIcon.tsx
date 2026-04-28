import type { SVGProps } from "react";

/**
 * Coach Cal mark — a coach's headset (brand orange) with a purple AI spark.
 * The spark gently pulses to signal the AI side of the persona.
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
        @keyframes coach-cal-spark {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.18); opacity: 0.85; }
        }
        .cc-spark {
          animation: coach-cal-spark 2.4s ease-in-out infinite;
          transform-origin: 19.5px 4.2px;
        }
      `}</style>

      {/* ── Headband arc ─────────────────────────────────────────── */}
      <path
        d="M5 13 Q12 4 19 13"
        stroke="#F26522"
        strokeWidth="1.8"
        fill="none"
      />

      {/* ── Left earcup ──────────────────────────────────────────── */}
      <rect
        x="3" y="12" width="4.6" height="6.2" rx="1.6"
        fill="#F26522"
      />
      <rect
        x="3.7" y="12.7" width="3.2" height="2.2" rx="0.9"
        fill="#FFB17A"
        opacity="0.55"
      />

      {/* ── Right earcup ─────────────────────────────────────────── */}
      <rect
        x="16.4" y="12" width="4.6" height="6.2" rx="1.6"
        fill="#F26522"
      />
      <rect
        x="17.1" y="12.7" width="3.2" height="2.2" rx="0.9"
        fill="#FFB17A"
        opacity="0.55"
      />

      {/* ── Boom mic — curves from right earcup toward the mouth ── */}
      <path
        d="M18.7 18 Q17 21.5 12.6 21.4"
        stroke="#F26522"
        strokeWidth="1.6"
        fill="none"
      />
      {/* Mic foam tip */}
      <circle cx="12.2" cy="21.4" r="1.35" fill="#1C1C1E"/>
      <circle cx="11.8" cy="21" r="0.35" fill="#FFB17A" opacity="0.7"/>

      {/* ── AI spark — pulsing, top-right ────────────────────────── */}
      <g className="cc-spark">
        <path
          d="M19.5 1.8 L20.2 3.6 L22 4.3 L20.2 5 L19.5 6.8 L18.8 5 L17 4.3 L18.8 3.6Z"
          fill="#a78bfa"
        />
      </g>
      <circle cx="16.6" cy="2.2" r="0.5" fill="#c4b5fd"/>
      <circle cx="22"   cy="7.2" r="0.42" fill="#c4b5fd"/>
    </svg>
  );
}
