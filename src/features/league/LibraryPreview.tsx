import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import type { LibraryPlanBlock, LibraryPlayPreview } from "@/lib/league/library";

// Shared visual vocabulary for league library content: real play diagrams
// (canonical PlayThumbnail render path) and practice-plan timelines. Used by
// the Library page, the per-league Playbooks (distribution) page, and the
// team-creation seeding panel — one look everywhere the operator asks
// "what am I actually giving this team?".

/** A strip of up to `max` play diagrams, with a "+N" tile when more exist. */
export function PlayThumbStrip({
  plays,
  totalPlays,
  max = 6,
  size = "md",
}: {
  plays: LibraryPlayPreview[];
  totalPlays: number;
  max?: number;
  size?: "sm" | "md";
}) {
  const shown = plays.slice(0, max);
  const extra = totalPlays - shown.length;
  if (shown.length === 0) {
    return (
      <div className="flex aspect-[16/5] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
        No plays yet
      </div>
    );
  }
  return (
    <div className={`grid gap-1.5 ${size === "sm" ? "grid-cols-4" : "grid-cols-3"}`}>
      {shown.map((p) => (
        <div key={p.id} className="min-w-0" title={p.name}>
          <PlayThumbnail preview={p.preview} thin />
          <div className="mt-0.5 truncate text-center text-[10px] leading-tight text-muted">
            {p.name}
          </div>
        </div>
      ))}
      {extra > 0 ? (
        <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-border bg-surface-inset text-xs font-medium text-muted">
          +{extra} more
        </div>
      ) : null}
    </div>
  );
}

/** A practice plan's block timeline: proportional duration bars with labels. */
export function PlanTimeline({
  blocks,
  totalDurationMinutes,
}: {
  blocks: LibraryPlanBlock[];
  totalDurationMinutes: number;
}) {
  if (blocks.length === 0) {
    return (
      <div className="flex aspect-[16/5] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
        No practice blocks yet
      </div>
    );
  }
  const total = Math.max(
    totalDurationMinutes,
    blocks.reduce((s, b) => s + b.durationMinutes, 0),
    1,
  );
  return (
    <div>
      <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-inset">
        {blocks.map((b, i) => (
          <div
            key={i}
            title={`${b.title} — ${b.durationMinutes} min`}
            className={`h-full ${i % 2 === 0 ? "bg-primary/70" : "bg-primary/40"}`}
            style={{ width: `${Math.max((b.durationMinutes / total) * 100, 3)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {blocks.slice(0, 5).map((b, i) => (
          <span key={i} className="truncate">
            {b.title} <span className="opacity-70">{b.durationMinutes}m</span>
            {b.laneCount > 1 ? <span className="opacity-70"> · {b.laneCount} stations</span> : null}
          </span>
        ))}
        {blocks.length > 5 ? <span>+{blocks.length - 5} more</span> : null}
      </div>
    </div>
  );
}
