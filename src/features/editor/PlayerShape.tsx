import type { PlayerShape as PlayerShapeName } from "@/domain/play/types";

/**
 * SVG shape primitive for a player token — the single definition of what a
 * player looks like.
 *
 * Extracted from EditorCanvas so every surface that draws a player token draws
 * the SAME glyph. It previously lived private to the canvas, and the formation
 * editor's player list hardcoded `rounded-full` alongside it. That was
 * invisibly fine while every formation was offense (all circles), and became
 * wrong the moment defensive formations existed: the field drew triangles
 * while the list beside it drew circles for the same five players.
 *
 * Anything rendering a player token should use this rather than re-deciding
 * what a defender looks like.
 */
export function PlayerShape({
  shape,
  cx,
  cy,
  r,
  fill,
  stroke,
  strokeWidth,
  pointerHandlers,
}: {
  shape: PlayerShapeName | undefined;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  pointerHandlers?: {
    onPointerDown?: (e: React.PointerEvent) => void;
    style?: React.CSSProperties;
  };
}) {
  const common = {
    fill,
    stroke,
    strokeWidth,
    vectorEffect: "non-scaling-stroke" as const,
    ...pointerHandlers,
  };
  if (shape === "square") {
    return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
  }
  if (shape === "diamond") {
    const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    return <polygon points={pts} {...common} />;
  }
  if (shape === "star") {
    const outer = r * 1.15;
    const inner = outer * 0.45;
    const pts = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? outer : inner;
      return `${cx + rad * Math.cos(angle)},${cy + rad * Math.sin(angle)}`;
    }).join(" ");
    return <polygon points={pts} strokeLinejoin="round" {...common} />;
  }
  if (shape === "triangle") {
    const pts = `${cx},${cy + r} ${cx + r},${cy - r} ${cx - r},${cy - r}`;
    return <polygon points={pts} {...common} />;
  }
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

/**
 * A player token at chip size, label and all — for lists and inspectors that
 * sit beside the canvas and must agree with it.
 *
 * The triangle's label rides slightly high (smaller y is higher in SVG)
 * because the glyph points DOWN — its mass is in the upper half, so a centred
 * label would drift toward the empty apex. Same nudge PlayerChip uses.
 */
export function PlayerShapeChip({
  shape,
  label,
  fill,
  stroke,
  labelColor,
  size = 28,
}: {
  shape: PlayerShapeName | undefined;
  label: string;
  fill: string;
  stroke: string;
  labelColor: string;
  size?: number;
}) {
  const isTriangle = shape === "triangle";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="shrink-0"
      aria-hidden="true"
    >
      <PlayerShape shape={shape} cx={10} cy={10} r={8.5} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text
        x={10}
        y={isTriangle ? 8.5 : 10}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={label.length > 1 ? 8 : 10}
        fontWeight={700}
        fill={labelColor}
        style={{ fontFamily: "inherit" }}
      >
        {label}
      </text>
    </svg>
  );
}
