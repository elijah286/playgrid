import type { SVGProps } from "react";

/**
 * Coach Cal mark — chat bubble with a navy football inside and three
 * brand dots (blue/lime/orange). Self-contained shape, no circle wrapper.
 */
export function CoachAiIcon({ className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 40 460 360"
      fill="none"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* Bubble outline */}
      <path
        d="M78 52 H372 C413 52 446 85 446 126 V245 C446 286 413 319 372 319 H186 L104 376 L119 319 H78 C37 319 4 286 4 245 V126 C4 85 37 52 78 52 Z"
        fill="#FFFFFF"
        stroke="#1E6BFF"
        strokeWidth="12"
        strokeLinejoin="round"
      />

      {/* Football + dots, scaled & translated to fit inside the bubble */}
      <g transform="translate(45 48) scale(0.74)">
        {/* Football body */}
        <path d="M160 92 Q258 52 356 92 L356 210 Q258 250 160 210 Z" fill="#0D1B3D" />
        <path d="M114 118 Q137 100 160 100 L160 202 Q137 202 115 186 Q95 172 95 160 Q95 146 114 118 Z" fill="#1E6BFF" />
        <path d="M356 100 Q379 100 403 118 Q423 134 423 160 Q423 172 403 186 Q380 202 356 202 Z" fill="#7ED321" />
        {/* Laces */}
        <g stroke="#FFFFFF" strokeLinecap="round" strokeWidth="10" fill="none">
          <path d="M200 148 L304 142" />
          <path d="M205 130 L209 166" />
          <path d="M235 128 L239 164" />
          <path d="M265 126 L269 162" />
          <path d="M295 124 L299 160" />
        </g>
        {/* Three brand dots */}
        <circle cx="176" cy="302" r="10" fill="#1E6BFF" />
        <circle cx="216" cy="302" r="10" fill="#7ED321" />
        <circle cx="256" cy="302" r="10" fill="#FF6A00" />
      </g>
    </svg>
  );
}
