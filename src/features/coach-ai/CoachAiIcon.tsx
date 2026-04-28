import type { SVGProps } from "react";

/**
 * Coach Cal mark — XO Grid Maker AI "main assistant" artwork.
 * Navy football with blue/lime tips orbiting an electric-blue ring,
 * accented with lime + soft-gray sparkles.
 */
export function CoachAiIcon({ className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20 40 472 200"
      fill="none"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <defs>
        <filter id="cc-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000000" floodOpacity="0.16" />
        </filter>
      </defs>

      {/* Football body */}
      <g filter="url(#cc-shadow)">
        <path d="M160 92 Q258 52 356 92 L356 210 Q258 250 160 210 Z" fill="#0D1B3D" />
        <path d="M114 118 Q137 100 160 100 L160 202 Q137 202 115 186 Q95 172 95 160 Q95 146 114 118 Z" fill="#1E6BFF" />
        <path d="M356 100 Q379 100 403 118 Q423 134 423 160 Q423 172 403 186 Q380 202 356 202 Z" fill="#7ED321" />
        <g stroke="#FFFFFF" strokeLinecap="round" strokeWidth="10" fill="none">
          <path d="M200 148 L304 142" />
          <path d="M205 130 L209 166" />
          <path d="M235 128 L239 164" />
          <path d="M265 126 L269 162" />
          <path d="M295 124 L299 160" />
        </g>
      </g>

      {/* Orbital ring */}
      <path
        d="M30 200 C 86 149, 138 149, 196 160 C 274 176, 334 155, 401 127 C 425 117, 446 113, 472 121"
        fill="none"
        stroke="#1E6BFF"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* Sparkles */}
      <path
        d="M0,-19 L4.5,-4.5 L19,0 L4.5,4.5 L0,19 L-4.5,4.5 L-19,0 L-4.5,-4.5 Z"
        fill="none"
        stroke="#7ED321"
        strokeWidth="4.5"
        transform="translate(436 92)"
      />
      <path
        d="M0,-8 L2,-2 L8,0 L2,2 L0,8 L-2,2 L-8,0 L-2,-2 Z"
        fill="none"
        stroke="#D1D5DB"
        strokeWidth="4"
        transform="translate(414 58) scale(.9)"
      />
      <path
        d="M0,-8 L2,-2 L8,0 L2,2 L0,8 L-2,2 L-8,0 L-2,-2 Z"
        fill="none"
        stroke="#D1D5DB"
        strokeWidth="4"
        transform="translate(470 196) scale(.95)"
      />
    </svg>
  );
}
