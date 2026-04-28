import type { EquipmentKind } from "@/domain/play/types";

/**
 * Small, neutral icons for practice-plan equipment props. Rendered inline
 * inside an SVG <g> at the equipment's normalized field position. Each icon
 * draws within a unit box centered at (0,0); the parent applies a transform
 * for position/rotation/scale.
 *
 * Coordinates are in the parent SVG's units (which the canvas maps from
 * normalized field coords). Sizes are deliberately small relative to a
 * player marker (player ≈ 0.056 units across; equipment ≈ 0.020-0.040).
 */
export function EquipmentIconShape({ kind }: { kind: EquipmentKind }) {
  switch (kind) {
    case "cone":
      // Triangle viewed from the side, with a small base.
      return (
        <g>
          <polygon
            points="0,-0.012 0.010,0.010 -0.010,0.010"
            fill="#f97316"
            stroke="#9a3412"
            strokeWidth="0.0015"
            strokeLinejoin="round"
          />
        </g>
      );
    case "tall_cone":
      return (
        <g>
          <polygon
            points="0,-0.020 0.012,0.014 -0.012,0.014"
            fill="#f97316"
            stroke="#9a3412"
            strokeWidth="0.0015"
            strokeLinejoin="round"
          />
        </g>
      );
    case "marker_disc":
      // Flat disc (top-down).
      return (
        <g>
          <circle
            r="0.010"
            fill="#fbbf24"
            stroke="#92400e"
            strokeWidth="0.0015"
          />
        </g>
      );
    case "agility_ladder":
      // Ladder seen from above, 5 rungs.
      return (
        <g stroke="#1f2937" strokeWidth="0.0015" fill="none">
          <rect x="-0.040" y="-0.012" width="0.080" height="0.024" fill="#fef3c7" />
          {[-0.024, -0.008, 0.008, 0.024].map((x) => (
            <line key={x} x1={x} y1={-0.012} x2={x} y2={0.012} />
          ))}
        </g>
      );
    case "hurdle":
      // Side profile: two posts + crossbar.
      return (
        <g stroke="#475569" strokeWidth="0.0020" fill="none">
          <line x1={-0.014} y1={0.008} x2={-0.014} y2={-0.010} />
          <line x1={0.014} y1={0.008} x2={0.014} y2={-0.010} />
          <line x1={-0.016} y1={-0.010} x2={0.016} y2={-0.010} stroke="#dc2626" strokeWidth="0.003" />
        </g>
      );
    case "agility_bag":
      // Long padded bag, top-down rectangle with rounded ends.
      return (
        <g>
          <rect
            x="-0.030"
            y="-0.006"
            width="0.060"
            height="0.012"
            rx="0.006"
            ry="0.006"
            fill="#3b82f6"
            stroke="#1e3a8a"
            strokeWidth="0.0015"
          />
        </g>
      );
    case "tackling_dummy":
      // Top-down stand-up dummy.
      return (
        <g>
          <ellipse rx="0.010" ry="0.014" fill="#94a3b8" stroke="#334155" strokeWidth="0.0015" />
          <line
            x1={0}
            y1={-0.014}
            x2={0}
            y2={0.014}
            stroke="#334155"
            strokeWidth="0.0015"
          />
        </g>
      );
    case "hoop":
      return (
        <g>
          <circle r="0.014" fill="none" stroke="#0ea5e9" strokeWidth="0.0030" />
        </g>
      );
    default:
      return null;
  }
}

export const EQUIPMENT_KINDS: { kind: EquipmentKind; label: string }[] = [
  { kind: "cone", label: "Cone" },
  { kind: "tall_cone", label: "Tall cone" },
  { kind: "marker_disc", label: "Disc" },
  { kind: "agility_ladder", label: "Ladder" },
  { kind: "hurdle", label: "Hurdle" },
  { kind: "agility_bag", label: "Bag" },
  { kind: "tackling_dummy", label: "Dummy" },
  { kind: "hoop", label: "Hoop" },
];
