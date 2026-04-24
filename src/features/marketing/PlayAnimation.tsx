"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Demo play on a field. Animates routes when scrolled into view — the
 * offensive players run slant/flat/go/drag/wheel patterns. Loops while
 * visible so the section feels alive without being distracting.
 */
export function PlayAnimation({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [inView, setInView] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const DURATION = 3200;
    const HOLD = 900;
    function tick(now: number) {
      const elapsed = now - start;
      const cycle = DURATION + HOLD;
      const phase = elapsed % cycle;
      const progress = Math.min(1, phase / DURATION);
      setT(progress);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  const ease = (x: number) => 1 - Math.pow(1 - x, 2);
  const p = ease(t);

  // Field: 400 wide x 260 tall. LOS at y=170. Offense below, runs up.
  const LOS = 170;

  const players = [
    // { start, end, color, label }
    // LT, LG, C, RG, RT — stay put (pass block bump)
    { sx: 140, sy: 180, ex: 140, ey: 175, color: "#9CA3AF", label: "LT" },
    { sx: 175, sy: 180, ex: 175, ey: 175, color: "#9CA3AF", label: "LG" },
    { sx: 210, sy: 180, ex: 210, ey: 175, color: "#9CA3AF", label: "C" },
    { sx: 245, sy: 180, ex: 245, ey: 175, color: "#9CA3AF", label: "RG" },
    { sx: 280, sy: 180, ex: 280, ey: 175, color: "#9CA3AF", label: "RT" },
    // QB drop back
    { sx: 210, sy: 200, ex: 210, ey: 220, color: "#1769FF", label: "QB" },
    // RB — flat to right
    { sx: 240, sy: 210, ex: 330, ey: 180, color: "#1769FF", label: "RB" },
    // TE — drag across
    { sx: 310, sy: 175, ex: 160, ey: 140, color: "#1769FF", label: "TE" },
    // Left WR — slant
    { sx: 70, sy: 170, ex: 140, ey: 90, color: "#F26522", label: "X" },
    // Right WR — go route
    { sx: 360, sy: 170, ex: 360, ey: 20, color: "#F26522", label: "Z" },
  ];

  return (
    <svg
      ref={ref}
      viewBox="0 0 400 260"
      className={className}
      role="img"
      aria-label="Animated example play"
    >
      {/* Field */}
      <defs>
        <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2D8B4E" />
          <stop offset="1" stopColor="#1B5E30" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="400" height="260" fill="url(#field)" rx="12" />
      {/* Yard lines */}
      {[40, 80, 120, 160, 200, 240].map((y) => (
        <line
          key={y}
          x1="10"
          y1={y}
          x2="390"
          y2={y}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
        />
      ))}
      {/* LOS (accent) */}
      <line
        x1="10"
        y1={LOS}
        x2="390"
        y2={LOS}
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />

      {/* Route trails */}
      {players.map((pl, i) => {
        const len = Math.hypot(pl.ex - pl.sx, pl.ey - pl.sy);
        if (len < 5) return null;
        return (
          <line
            key={`trail-${i}`}
            x1={pl.sx}
            y1={pl.sy}
            x2={pl.sx + (pl.ex - pl.sx) * p}
            y2={pl.sy + (pl.ey - pl.sy) * p}
            stroke={pl.color}
            strokeWidth="2"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
        );
      })}

      {/* Players */}
      {players.map((pl, i) => {
        const x = pl.sx + (pl.ex - pl.sx) * p;
        const y = pl.sy + (pl.ey - pl.sy) * p;
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r="8"
              fill={pl.color}
              stroke="white"
              strokeWidth="1.5"
            />
            <text
              x={x}
              y={y + 3}
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="white"
            >
              {pl.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
