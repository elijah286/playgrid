"use client";

import { useEffect, useRef, useState } from "react";

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
const BRAND_ORANGE = "#F26522";

const PLAYS = [
  { n: "02", name: "PA Go", tag: "Shot" },
  { n: "14", name: "Mesh", tag: "3rd" },
  { n: "21", name: "Counter", tag: "Run" },
  { n: "33", name: "Y-Stick", tag: "3rd" },
  { n: "07", name: "Slant/Flat", tag: "Quick" },
  { n: "44", name: "Sprint Out", tag: "Boot" },
  { n: "88", name: "Four Verts", tag: "Shot" },
  { n: "52", name: "Power", tag: "Run" },
];

type View = "list" | "play";

type S = {
  view: View;
  highlight: number;
  scrollY: number;
  cx: number;
  cy: number;
  tap: boolean;
  outcome: number | null;
  playKey: number;
};

const INIT: S = {
  view: "list",
  highlight: 1,
  scrollY: 0,
  cx: 82,
  cy: 90,
  tap: false,
  outcome: null,
  playKey: 0,
};

// Each step describes how the state changes and how long to dwell before
// advancing. Cursor position uses a CSS transition with duration = dur, so
// longer dur → smoother glide.
const STEPS: Array<{ dur: number; s: Partial<S> }> = [
  { dur: 600, s: {} },
  { dur: 750, s: { cx: 50, cy: 32 } }, // glide to Mesh
  { dur: 260, s: { tap: true } },
  { dur: 180, s: { tap: false, view: "play", playKey: 1 } },
  { dur: 2600, s: {} }, // play runs
  { dur: 260, s: { view: "list" } },
  { dur: 600, s: { cx: 55, cy: 92 } }, // to outcome row
  { dur: 260, s: { tap: true, outcome: 1 } }, // tap +7
  { dur: 400, s: { tap: false } },
  { dur: 750, s: { scrollY: 72, cx: 50, cy: 72, outcome: null } }, // scroll
  { dur: 550, s: { cx: 50, cy: 48, highlight: 5 } }, // hover Sprint Out
  { dur: 260, s: { tap: true } },
  { dur: 180, s: { tap: false, view: "play", playKey: 2 } },
  { dur: 2400, s: {} }, // second play runs
  { dur: 260, s: { view: "list", scrollY: 72 } },
  { dur: 400, s: { cx: 82, cy: 90 } }, // reset
  { dur: 200, s: { ...INIT } },
];

export function AnimatedGameMode() {
  const [s, setS] = useState<S>(INIT);
  const [lastDur, setLastDur] = useState<number>(300);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  // Only start the animation when visible — save cycles if off-screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setPlaying(e.isIntersecting),
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let i = 0;
    let cur: S = INIT;

    const tick = () => {
      if (cancelled) return;
      const step = STEPS[i % STEPS.length];
      cur = { ...cur, ...step.s };
      setLastDur(step.dur);
      setS(cur);
      i += 1;
      timerRef.current = window.setTimeout(tick, step.dur);
    };
    timerRef.current = window.setTimeout(tick, 200);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [playing]);

  return (
    <div
      ref={rootRef}
      className="relative flex h-full flex-col overflow-hidden bg-neutral-900 text-white"
    >
      {/* Status bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px]">
        <span className="font-semibold">Q2 · 7:14</span>
        <span>3rd &amp; 4 · @ opp 28</span>
      </div>

      {/* Views */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            s.view === "list" ? "opacity-100" : "opacity-0"
          }`}
        >
          <CallSheet highlight={s.highlight} scrollY={s.scrollY} />
        </div>
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            s.view === "play" ? "opacity-100" : "opacity-0"
          }`}
        >
          <PlayRun key={s.playKey} playIdx={s.highlight} />
        </div>
      </div>

      {/* Outcome row */}
      <div className="grid grid-cols-3 gap-1 border-t border-white/10 p-2">
        {["+3", "+7", "TD"].map((l, i) => {
          const active = s.outcome === i;
          return (
            <button
              key={l}
              className={`rounded py-2 text-[10px] font-bold transition-transform ${
                active ? "scale-[1.06]" : ""
              }`}
              style={{
                background:
                  i === 2 ? BRAND_GREEN : i === 1 ? BRAND_BLUE : "#374151",
                boxShadow: active ? "0 0 0 2px white inset" : undefined,
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      {/* Cursor + tap ripple */}
      <div
        className="pointer-events-none absolute z-20"
        style={{
          left: `${s.cx}%`,
          top: `${s.cy}%`,
          transform: "translate(-50%, -50%)",
          transition: `left ${lastDur}ms cubic-bezier(0.4, 0, 0.2, 1), top ${lastDur}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
      >
        <div className="relative">
          {/* dot */}
          <div className="h-4 w-4 rounded-full bg-white/90 shadow-[0_0_0_2px_rgba(0,0,0,0.25),0_2px_6px_rgba(0,0,0,0.35)]" />
          {/* tap ripple */}
          {s.tap && (
            <div
              className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80"
              style={{ animation: "gm-ripple 380ms ease-out forwards" }}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes gm-ripple {
          0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
        }
        @keyframes gm-route-dash {
          from { stroke-dashoffset: 120; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes gm-ball {
          0% { offset-distance: 0%; opacity: 0; }
          10% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CallSheet({
  highlight,
  scrollY,
}: {
  highlight: number;
  scrollY: number;
}) {
  return (
    <div className="h-full overflow-hidden">
      <div
        className="space-y-1 p-2"
        style={{
          transform: `translateY(-${scrollY}px)`,
          transition: "transform 700ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {PLAYS.map((p, i) => (
          <div
            key={p.n}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors"
            style={{
              background: i === highlight ? BRAND_BLUE : "rgba(255,255,255,0.05)",
            }}
          >
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold"
              style={{
                background: i === highlight ? "white" : BRAND_ORANGE,
                color: i === highlight ? BRAND_BLUE : "white",
              }}
            >
              {p.n}
            </span>
            <span className="font-semibold">{p.name}</span>
            <span className="ml-auto text-[9px] opacity-70">#{p.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Miniature animated play diagram shown when the coach taps a play. Routes
 * draw themselves in and a ball follows the primary route.
 */
function PlayRun({ playIdx }: { playIdx: number }) {
  const play = PLAYS[playIdx] ?? PLAYS[1];
  // Two canned diagrams — alternate based on parity so the second tap looks
  // different from the first.
  const variant = playIdx % 2;

  return (
    <div className="flex h-full w-full flex-col bg-neutral-900">
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-white/70">
        <span className="font-semibold text-white">
          #{play.n} · {play.name}
        </span>
        <span>#{play.tag}</span>
      </div>
      <div className="relative flex-1">
        <svg viewBox="0 0 100 160" className="h-full w-full">
          {/* field */}
          <rect x="0" y="0" width="100" height="160" fill="#12361f" />
          {[40, 70, 100, 130].map((y) => (
            <line
              key={y}
              x1="5"
              x2="95"
              y1={y}
              y2={y}
              stroke="#ffffff22"
              strokeWidth="0.5"
            />
          ))}
          {/* LOS */}
          <line
            x1="5"
            x2="95"
            y1="100"
            y2="100"
            stroke="#ffffff"
            strokeWidth="0.6"
            strokeDasharray="2 2"
            opacity="0.5"
          />

          {/* routes */}
          {variant === 0 ? (
            <>
              <Route d="M25 100 C 25 80, 40 70, 55 55" color={BRAND_BLUE} />
              <Route d="M75 100 C 75 85, 60 75, 45 60" color={BRAND_ORANGE} delay={200} />
              <Route d="M50 100 L 50 70" color="#ffffff" delay={400} />
            </>
          ) : (
            <>
              <Route d="M20 100 L 20 40" color={BRAND_BLUE} />
              <Route d="M40 100 L 40 50" color={BRAND_ORANGE} delay={150} />
              <Route d="M60 100 L 60 50" color={BRAND_GREEN} delay={300} />
              <Route d="M80 100 L 80 40" color="#ffffff" delay={450} />
            </>
          )}

          {/* OL */}
          {[30, 42, 54, 66, 78].map((x) => (
            <rect
              key={x}
              x={x - 3}
              y={102}
              width="6"
              height="4"
              fill="#ffffffaa"
            />
          ))}
          {/* QB */}
          <circle cx="54" cy="118" r="3" fill={BRAND_BLUE} stroke="white" strokeWidth="0.6" />
          {/* skill players at route starts */}
          {variant === 0 ? (
            <>
              <circle cx="25" cy="100" r="2.5" fill={BRAND_ORANGE} />
              <circle cx="75" cy="100" r="2.5" fill={BRAND_ORANGE} />
              <circle cx="50" cy="115" r="2.5" fill={BRAND_GREEN} />
            </>
          ) : (
            <>
              <circle cx="20" cy="100" r="2.5" fill={BRAND_ORANGE} />
              <circle cx="40" cy="100" r="2.5" fill={BRAND_ORANGE} />
              <circle cx="60" cy="100" r="2.5" fill={BRAND_ORANGE} />
              <circle cx="80" cy="100" r="2.5" fill={BRAND_ORANGE} />
            </>
          )}

          {/* ball following primary */}
          <circle
            r="1.8"
            fill="#8B4513"
            stroke="white"
            strokeWidth="0.3"
            style={{
              offsetPath:
                variant === 0
                  ? `path("M25 100 C 25 80, 40 70, 55 55")`
                  : `path("M20 100 L 20 40")`,
              animation: "gm-ball 1800ms cubic-bezier(0.4, 0, 0.2, 1) 400ms forwards",
              opacity: 0,
            }}
          />
        </svg>
      </div>
    </div>
  );
}

function Route({
  d,
  color,
  delay = 0,
}: {
  d: string;
  color: string;
  delay?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeDasharray="120"
      style={{
        animation: `gm-route-dash 1200ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms forwards`,
        strokeDashoffset: 120,
      }}
    />
  );
}
