import type { Player } from "@/domain/play/types";

/**
 * Small SVG thumbnail of a formation's player layout, used inside the
 * create-play surface. Ported from the playbook page's inline
 * `MiniPlayerDiagram` so the create surface can live in its own feature
 * folder without importing from a route file. Orientation matches
 * EditorCanvas / PlayThumbnail: y is flipped (offense at the bottom) and
 * triangles point apex-down.
 */
export function MiniFormationDiagram({ players }: { players: Player[] | null }) {
  const SIZE = 80;
  const DOT_R = 4;

  if (!players) {
    return (
      <svg width={SIZE} height={SIZE} viewBox="0 0 80 80" className="opacity-60">
        <rect width={80} height={80} rx={6} fill="#2D8B4E" />
        {[
          [40, 68],
          [40, 58],
          [22, 48],
          [40, 48],
          [58, 48],
          [12, 36],
          [68, 36],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={DOT_R} fill="#FFFFFF" />
        ))}
      </svg>
    );
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 80 80">
      <rect width={80} height={80} rx={6} fill="#2D8B4E" />
      {players.map((pl) => {
        const cx = pl.position.x * SIZE;
        const cy = (1 - pl.position.y) * SIZE;
        const common = {
          fill: pl.style.fill,
          stroke: pl.style.stroke,
          strokeWidth: 1,
        } as const;
        if (pl.shape === "triangle") {
          const pts = `${cx},${cy + DOT_R} ${cx - DOT_R},${cy - DOT_R} ${cx + DOT_R},${cy - DOT_R}`;
          return <polygon key={pl.id} points={pts} {...common} />;
        }
        if (pl.shape === "square") {
          return (
            <rect
              key={pl.id}
              x={cx - DOT_R}
              y={cy - DOT_R}
              width={DOT_R * 2}
              height={DOT_R * 2}
              {...common}
            />
          );
        }
        return <circle key={pl.id} cx={cx} cy={cy} r={DOT_R} {...common} />;
      })}
    </svg>
  );
}
