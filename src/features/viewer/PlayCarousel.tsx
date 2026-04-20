"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Monitor } from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import { pathGeometryToSvgD, routeToPathGeometry } from "@/domain/play/geometry";
import { resolveRouteStroke } from "@/domain/play/factory";
import { Button, Input } from "@/components/ui";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { PlayControls } from "@/features/animation/PlayControls";

type PlayRow = {
  id: string;
  name: string;
  wristband_code: string | null;
  shorthand: string | null;
};

type Props = {
  plays: PlayRow[];
  currentId: string;
  document: PlayDocument;
  playbookId: string;
};

export function PlayCarousel({ plays, currentId, document, playbookId }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const anim = usePlayAnimation(document);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return plays;
    return plays.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
        (p.shorthand && p.shorthand.toLowerCase().includes(s)),
    );
  }, [plays, q]);

  const idx = plays.findIndex((p) => p.id === currentId);
  const prev = idx > 0 ? plays[idx - 1] : null;
  const next = idx >= 0 && idx < plays.length - 1 ? plays[idx + 1] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Input
        leftIcon={Search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search code or name"
      />

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-surface-raised p-2">
        <ul className="space-y-1">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/m/play/${p.id}?playbookId=${playbookId}`}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  p.id === currentId
                    ? "bg-primary text-white font-medium"
                    : "hover:bg-surface-inset text-foreground"
                }`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="opacity-70 text-xs">{p.wristband_code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Button
          variant="secondary"
          leftIcon={ChevronLeft}
          disabled={!prev}
          onClick={() => prev && router.push(`/m/play/${prev.id}?playbookId=${playbookId}`)}
          className="justify-center"
        >
          Prev
        </Button>
        <div className="relative aspect-[4/3] w-full max-w-[280px] justify-self-center overflow-hidden rounded-xl shadow-card">
          <svg viewBox="0 0 1 1" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mobileFieldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2D8B4E" />
                <stop offset="100%" stopColor="#247540" />
              </linearGradient>
            </defs>
            <rect width={1} height={1} fill="url(#mobileFieldGrad)" />
            {anim.phase === "idle" && document.layers.routes.map((r) => (
              <path
                key={r.id}
                d={pathGeometryToSvgD(routeToPathGeometry(r))}
                fill="none"
                stroke={resolveRouteStroke(r, document.layers.players)}
                strokeWidth={0.004}
              />
            ))}
            {anim.phase === "idle" && document.layers.players.map((pl) => (
              <g key={pl.id}>
                <circle
                  cx={pl.position.x}
                  cy={1 - pl.position.y}
                  r={0.03}
                  fill="#FFFFFF"
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth={0.003}
                />
                <text
                  x={pl.position.x}
                  y={1 - pl.position.y + 0.01}
                  textAnchor="middle"
                  fontSize={0.022}
                  fontWeight={700}
                  fill="#1C1C1E"
                  style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                >
                  {pl.label}
                </text>
              </g>
            ))}
          </svg>
          <AnimationOverlay doc={document} anim={anim} fieldAspect={1} />
          <PlayControls anim={anim} />
        </div>
        <Button
          variant="secondary"
          rightIcon={ChevronRight}
          disabled={!next}
          onClick={() => next && router.push(`/m/play/${next.id}?playbookId=${playbookId}`)}
          className="justify-center"
        >
          Next
        </Button>
      </div>

      <Link href={`/plays/${currentId}/edit`} className="block">
        <Button variant="primary" leftIcon={Monitor} className="w-full justify-center">
          Edit on desktop
        </Button>
      </Link>
    </div>
  );
}
