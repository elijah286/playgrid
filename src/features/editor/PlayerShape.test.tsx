/**
 * The player token's glyph must be the same everywhere it's drawn.
 *
 * The formation editor's player list hardcoded a circle (`rounded-full`) while
 * the canvas beside it drew the player's real shape. That was invisibly fine
 * while every formation was offense — all circles — and became wrong the
 * moment defensive formations existed: the field showed five triangles and the
 * list next to it showed five circles for the same five players.
 *
 * PlayerShape is now the single definition, shared by the canvas and the
 * inspector. These pin each shape to its SVG primitive.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerShape, PlayerShapeChip } from "./PlayerShape";
import { defaultDefendersForVariant, defaultPlayersForVariant } from "@/domain/play/factory";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const chip = (shape: Parameters<typeof PlayerShapeChip>[0]["shape"]) =>
  html(
    <PlayerShapeChip
      shape={shape}
      label="C"
      fill="#EF4444"
      stroke="#991b1b"
      labelColor="#fff"
    />,
  );

describe("PlayerShape", () => {
  const base = { cx: 10, cy: 10, r: 9, fill: "#fff", stroke: "#000", strokeWidth: 1.5 };

  it.each([
    ["triangle", "<polygon"],
    ["square", "<rect"],
    ["diamond", "<polygon"],
    ["star", "<polygon"],
    ["circle", "<circle"],
  ] as const)("%s renders %s", (shape, primitive) => {
    expect(html(<PlayerShape shape={shape} {...base} />)).toContain(primitive);
  });

  it("falls back to a circle when shape is undefined (offense carries none)", () => {
    expect(html(<PlayerShape shape={undefined} {...base} />)).toContain("<circle");
  });

  it("points the triangle DOWN, toward the offense", () => {
    // Apex at cy + r (bottom), base across the top — matches the diagram glyph.
    const out = html(<PlayerShape shape="triangle" {...base} />);
    expect(out).toContain("10,19");
  });
});

describe("PlayerShapeChip — the sidebar glyph agrees with the field", () => {
  it("draws a defender as a triangle, not a circle", () => {
    expect(chip("triangle")).toContain("<polygon");
    expect(chip("triangle")).not.toContain("<circle");
  });

  it("draws an offensive player as a circle", () => {
    expect(chip(undefined)).toContain("<circle");
    expect(chip(undefined)).not.toContain("<polygon");
  });

  it("every default DEFENDER chips as a triangle", () => {
    for (const p of defaultDefendersForVariant("flag_5v5")) {
      expect(chip(p.shape)).toContain("<polygon");
    }
  });

  it("every default OFFENSIVE player chips as a circle", () => {
    for (const p of defaultPlayersForVariant("flag_5v5")) {
      expect(chip(p.shape)).toContain("<circle");
    }
  });

  it("keeps the label inside the glyph", () => {
    expect(chip("triangle")).toContain(">C<");
  });
});
