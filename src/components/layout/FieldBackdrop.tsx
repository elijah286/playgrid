/**
 * Site-wide football-field-inspired backdrop.
 *
 * Faint yard lines with sparse hash marks (no stitch-looking tick rows),
 * plus a handful of X/O players with routes + zones scattered across the
 * field like a play diagram. Layered behind all content at very low
 * opacity so it reads as texture, not decoration.
 *
 * `currentColor` lets the stroke color flip between light + dark mode
 * via Tailwind text utilities. Fixed-positioned, -z-10, pointer-events
 * disabled.
 */
export function FieldBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        maskImage:
          "radial-gradient(ellipse 115% 85% at 50% 30%, #000 60%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 115% 85% at 50% 30%, #000 60%, transparent 100%)",
      }}
    >
      {/* Soft brand-color blooms that tint the whole page. */}
      <div
        className="absolute -left-40 top-20 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ background: "rgba(23, 105, 255, 0.14)" }}
      />
      <div
        className="absolute -right-32 top-40 h-[24rem] w-[24rem] rounded-full blur-3xl"
        style={{ background: "rgba(149, 204, 31, 0.16)" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full blur-3xl"
        style={{ background: "rgba(255, 122, 0, 0.10)" }}
      />

      <svg
        className="relative h-full w-full text-[#B7C2D0] dark:text-[#2A3140]"
        viewBox="0 0 1600 1200"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Yard lines: one horizontal line per 160px, with just two hash ticks
              at ~1/3 and ~2/3 of the width. Real football fields only mark
              hash ticks at two column positions — NOT a dense row of ticks. */}
          <pattern
            id="yard-lines"
            width="1600"
            height="160"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="80"
              x2="1600"
              y2="80"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.35"
            />
            <line
              x1="533"
              y1="73"
              x2="533"
              y2="87"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
            <line
              x1="1067"
              y1="73"
              x2="1067"
              y2="87"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
          </pattern>
        </defs>

        <rect width="1600" height="1200" fill="url(#yard-lines)" />

        {/* Scattered play-diagram motifs: X/O players with routes or zones.
            Very low opacity so they sit as watermarks under the content. */}
        <g opacity="0.18" stroke="currentColor" fill="none" strokeLinecap="round">
          {/* X — go route curling upfield */}
          <g transform="translate(220 360)">
            <line x1="-11" y1="-11" x2="11" y2="11" strokeWidth="3" />
            <line x1="11" y1="-11" x2="-11" y2="11" strokeWidth="3" />
            <path d="M 0 -14 C 4 -70 -10 -130 30 -180" strokeWidth="2" />
            <polyline points="22,-172 30,-180 34,-170" strokeWidth="2" />
          </g>

          {/* O — zone defender with a shallow pass-coverage arc */}
          <g transform="translate(1260 460)">
            <circle r="12" strokeWidth="3" />
            <path
              d="M -70 -12 Q 0 -72 70 -12"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
          </g>

          {/* X — curl route */}
          <g transform="translate(470 820)">
            <line x1="-11" y1="-11" x2="11" y2="11" strokeWidth="3" />
            <line x1="11" y1="-11" x2="-11" y2="11" strokeWidth="3" />
            <path d="M 0 -14 L 0 -90 Q 12 -108 -16 -104" strokeWidth="2" />
            <polyline points="-9,-98 -16,-104 -10,-111" strokeWidth="2" />
          </g>

          {/* O — deep-zone defender with a broader coverage ellipse */}
          <g transform="translate(820 200)">
            <circle r="12" strokeWidth="3" />
            <ellipse
              cx="0"
              cy="50"
              rx="95"
              ry="40"
              strokeWidth="2"
              strokeDasharray="6 5"
            />
          </g>

          {/* X — slant route */}
          <g transform="translate(1120 880)">
            <line x1="-11" y1="-11" x2="11" y2="11" strokeWidth="3" />
            <line x1="11" y1="-11" x2="-11" y2="11" strokeWidth="3" />
            <path d="M 0 -14 L 0 -50 L 70 -110" strokeWidth="2" />
            <polyline points="60,-105 70,-110 66,-100" strokeWidth="2" />
          </g>

          {/* O — flat-zone with short arc */}
          <g transform="translate(340 640)">
            <circle r="12" strokeWidth="3" />
            <path
              d="M -55 10 Q 0 -40 55 10"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
