/**
 * Site-wide football-field-inspired backdrop.
 *
 * Rendered once in the root layout behind all pages. Uses an SVG pattern
 * of yard-line stripes + hash-mark ticks, softly masked with a radial
 * vignette so edges fade. `currentColor` lets the stroke color flip
 * between light + dark mode via Tailwind text utilities.
 *
 * Fixed-positioned with -z-10 so it sits behind content but above the
 * body background. pointer-events-none so it never eats clicks.
 */
export function FieldBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        maskImage:
          "radial-gradient(ellipse 110% 80% at 50% 30%, #000 55%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 110% 80% at 50% 30%, #000 55%, transparent 100%)",
      }}
    >
      {/* Soft color blooms — the blue gradient the user liked from the early
          preview. Kept very low opacity so they read as a tint, not a wash. */}
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
        className="relative h-full w-full text-[#C7D0DB] dark:text-[#242A37]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="field-hashes"
            width="160"
            height="220"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-1.5)"
          >
            {/* Yard line (horizontal stripe). */}
            <line
              x1="0"
              y1="110"
              x2="160"
              y2="110"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.55"
            />
            {/* Four hash-mark ticks along the yard line. */}
            <line
              x1="20"
              y1="104"
              x2="20"
              y2="116"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="60"
              y1="104"
              x2="60"
              y2="116"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="100"
              y1="104"
              x2="100"
              y2="116"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="140"
              y1="104"
              x2="140"
              y2="116"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            {/* Faint intermediate hash row for rhythm without adding a full line. */}
            <line
              x1="40"
              y1="214"
              x2="40"
              y2="220"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
            <line
              x1="120"
              y1="214"
              x2="120"
              y2="220"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#field-hashes)" opacity="0.6" />
      </svg>
    </div>
  );
}
