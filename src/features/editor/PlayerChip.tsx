import type { Player } from "@/domain/play/types";

export function PlayerChip({
  player,
  size = 16,
}: {
  player: Pick<Player, "label" | "style">;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="inline-block align-text-bottom"
      aria-hidden="true"
    >
      <circle
        cx={10}
        cy={10}
        r={9}
        fill={player.style.fill}
        stroke={player.style.stroke}
        strokeWidth={1.5}
      />
      <text
        x={10}
        y={10}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={player.label.length > 1 ? 9 : 11}
        fontWeight={700}
        fill={player.style.labelColor}
        style={{ fontFamily: "inherit" }}
      >
        {player.label}
      </text>
    </svg>
  );
}

export function playerChipHtml(
  player: Pick<Player, "label" | "style">,
  size = 16,
): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fs = player.label.length > 1 ? 9 : 11;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:inline-block;vertical-align:-2px" aria-hidden="true">` +
    `<circle cx="10" cy="10" r="9" fill="${esc(player.style.fill)}" stroke="${esc(player.style.stroke)}" stroke-width="1.5"></circle>` +
    `<text x="10" y="10" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${esc(player.style.labelColor)}">${esc(player.label)}</text>` +
    `</svg>`
  );
}
