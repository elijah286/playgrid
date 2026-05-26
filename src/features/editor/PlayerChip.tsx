import type { Player } from "@/domain/play/types";

// Triangle pointing down (apex toward offense) — matches the diagram glyph.
// Vertices: top-left (1,2), top-right (19,2), bottom-center (10,18).
const TRIANGLE_POINTS = "10,18 1,2 19,2";

export function PlayerChip({
  player,
  size = 16,
}: {
  player: Pick<Player, "label" | "style" | "shape">;
  size?: number;
}) {
  const labelColor = player.style.labelColor;
  const isTriangle = player.shape === "triangle";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="inline-block align-text-bottom"
      aria-hidden="true"
    >
      {isTriangle ? (
        <polygon
          points={TRIANGLE_POINTS}
          fill={player.style.fill}
          stroke={player.style.stroke}
          strokeWidth={1.5}
        />
      ) : (
        <circle
          cx={10}
          cy={10}
          r={9}
          fill={player.style.fill}
          stroke={player.style.stroke}
          strokeWidth={1.5}
        />
      )}
      <text
        x={10}
        y={isTriangle ? 9 : 10}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={player.label.length > 1 ? 9 : 11}
        fontWeight={700}
        fill={labelColor}
        style={{ fontFamily: "inherit" }}
      >
        {player.label}
      </text>
    </svg>
  );
}

export function playerChipHtml(
  player: Pick<Player, "label" | "style" | "shape">,
  size = 16,
): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fs = player.label.length > 1 ? 9 : 11;
  const labelColor = esc(player.style.labelColor);
  const isTriangle = player.shape === "triangle";
  const shape = isTriangle
    ? `<polygon points="${TRIANGLE_POINTS}" fill="${esc(player.style.fill)}" stroke="${esc(player.style.stroke)}" stroke-width="1.5"></polygon>`
    : `<circle cx="10" cy="10" r="9" fill="${esc(player.style.fill)}" stroke="${esc(player.style.stroke)}" stroke-width="1.5"></circle>`;
  const ty = isTriangle ? 9 : 10;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:inline-block;vertical-align:middle" aria-hidden="true">` +
    shape +
    `<text x="10" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${labelColor}">${esc(player.label)}</text>` +
    `</svg>`
  );
}
