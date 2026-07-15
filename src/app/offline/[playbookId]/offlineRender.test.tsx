// @vitest-environment jsdom
/**
 * Regression: the offline play viewer must render through the SHARED
 * canonical renderer (PlayDocRender), NOT a stripped-down bespoke field.
 *
 * A coach reported (2026-07-15) that offline plays "look totally different"
 * — the old OfflinePlayView drew a flat green field with plain white
 * circles and arrowhead-less routes, nothing like the online editor / Cal
 * diagram. This test renders a representative PlayDocument through
 * PlayDocRender and asserts the canonical chrome is present: yard lines +
 * line of scrimmage, player tokens painted with the document's own colors
 * (not hardcoded white), and route end decorations (arrowheads). If someone
 * swaps in a simplified offline renderer again, these assertions fail.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayDocRender } from "@/features/coach-ai/PlayDiagramEmbed";
import type { PlayDocument } from "@/domain/play/types";

// Minimal but representative doc: one colored offense player + one route
// with an arrow terminal, standard 7v7 field, yard lines on by default.
const DOC = {
  schemaVersion: 2,
  lineOfScrimmageY: 0.4,
  sportProfile: {
    variant: "flag_7v7",
    fieldWidthYds: 30,
    fieldLengthYds: 25,
    defensePlayerCount: 7,
    offensePlayerCount: 7,
  },
  metadata: { formation: "Spread Doubles" },
  formation: {},
  timeline: { events: [] },
  layers: {
    zones: [],
    annotations: [],
    players: [
      {
        id: "p1",
        role: "X",
        label: "X",
        shape: "circle",
        eligible: true,
        position: { x: 0.1, y: 0.4 },
        style: { fill: "#EF4444", stroke: "#991B1B", labelColor: "#FFFFFF" },
      },
    ],
    routes: [
      {
        id: "r1",
        carrierPlayerId: "p1",
        semantic: "go",
        endDecoration: "arrow",
        style: { stroke: "#EF4444", strokeWidth: 1.8 },
        nodes: [
          { id: "n1", position: { x: 0.1, y: 0.4 } },
          { id: "n2", position: { x: 0.1, y: 0.9 } },
        ],
        segments: [{ id: "s1", shape: "line", fromNodeId: "n1", toNodeId: "n2" }],
      },
    ],
  },
} as unknown as PlayDocument;

describe("offline viewer canonical rendering", () => {
  const html = renderToStaticMarkup(<PlayDocRender doc={DOC} />);

  it("draws real field chrome — yard lines and a dashed line of scrimmage", () => {
    const lineCount = (html.match(/<line/g) || []).length;
    // Bare OfflinePlayView drew ZERO <line>s (no yard lines, no LOS).
    // The canonical field draws several yard lines + the LOS.
    expect(lineCount).toBeGreaterThan(1);
    expect(html).toMatch(/stroke-dasharray="6 4"/); // LOS dash
  });

  it("paints the player token with the document's own color, not hardcoded white", () => {
    expect(html).toContain("#EF4444"); // player fill from doc
    // The old renderer hardcoded fill="#FFFFFF" for every player.
    expect(html).not.toMatch(/<circle[^>]*fill="#FFFFFF"/);
  });

  it("renders a route end decoration (arrowhead polygon)", () => {
    // Bare OfflinePlayView drew plain <path>s with no arrowheads.
    expect(html).toMatch(/<polygon/);
  });
});
