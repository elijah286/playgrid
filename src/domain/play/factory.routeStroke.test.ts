/**
 * Regression test for the coach report of Jul 2026:
 *
 *   "it defaults to white and the qb defaults to white so if you want the QB
 *    to run a route, you cant see it against the white background."
 *
 * The chain that produced it: routes store #FFFFFF as a sentinel meaning
 * "no explicit colour, inherit the carrier"; the QB's fill is #FFFFFF because
 * the palette is tuned for the green editor field; printed playsheets draw a
 * white field. So the QB's route resolved to white and was painted onto white
 * paper. The marker survived only because print/templates.ts already forces an
 * outline on light fills — routes had no equivalent rescue.
 *
 * These tests pin the resolution CHAIN (sentinel -> inherit -> rescue). The
 * threshold maths itself lives in contrast.test.ts.
 */

import { describe, expect, it } from "vitest";
import { resolveRouteStroke } from "./factory";
import type { Player, Route } from "./types";

/** QB exactly as styleForRole builds it (factory.ts:278). */
const QB: Player = {
  id: "qb1",
  role: "QB",
  label: "Q",
  position: { x: 0.5, y: 0.3 },
  eligible: true,
  style: { fill: "#FFFFFF", stroke: "#0f172a", labelColor: "#1C1C1E" },
};

/** X receiver — a saturated fill that must never be rescued. */
const X: Player = {
  id: "x1",
  role: "WR",
  label: "X",
  position: { x: 0.1, y: 0.3 },
  eligible: true,
  style: { fill: "#EF4444", stroke: "#7f1d1d", labelColor: "#FFFFFF" },
};

function routeFor(carrierPlayerId: string, stroke: string): Route {
  return {
    id: `route-${carrierPlayerId}`,
    carrierPlayerId,
    semantic: null,
    nodes: [],
    segments: [],
    style: { stroke, strokeWidth: 2.5 },
  };
}

describe("resolveRouteStroke — the reported bug", () => {
  it("no longer paints the QB's route white on a printed (white) sheet", () => {
    const route = routeFor("qb1", "#FFFFFF"); // sentinel = inherit the QB's fill
    const stroke = resolveRouteStroke(route, [QB], "white");
    expect(stroke.toLowerCase()).not.toBe("#ffffff");
  });

  it("paints it in the QB's own marker-ring colour, so the line still reads as the QB's", () => {
    const route = routeFor("qb1", "#FFFFFF");
    expect(resolveRouteStroke(route, [QB], "white")).toBe(QB.style.stroke);
  });

  it("still paints the QB's route white on the green editor field", () => {
    // The coach's workaround was recolouring the QB purple. Nobody should have
    // to do that — but equally, the editor must not change for anyone.
    const route = routeFor("qb1", "#FFFFFF");
    expect(resolveRouteStroke(route, [QB], "green")).toBe("#FFFFFF");
  });
});

describe("resolveRouteStroke — the sentinel", () => {
  it("treats #FFFFFF as 'inherit the carrier', not as a colour choice", () => {
    expect(resolveRouteStroke(routeFor("x1", "#FFFFFF"), [X], "green")).toBe(X.style.fill);
  });

  it("accepts the sentinel in shorthand and mixed case", () => {
    expect(resolveRouteStroke(routeFor("x1", "#fff"), [X], "green")).toBe(X.style.fill);
    expect(resolveRouteStroke(routeFor("x1", "#FfFfFf"), [X], "green")).toBe(X.style.fill);
  });

  it("honours an explicit non-sentinel stroke over the carrier's fill", () => {
    expect(resolveRouteStroke(routeFor("x1", "#123456"), [X], "green")).toBe("#123456");
  });

  it("rescues an explicitly-chosen stroke that would vanish on the field", () => {
    // A coach who hand-picked a near-white stroke still must not get an
    // invisible line on paper.
    const stroke = resolveRouteStroke(routeFor("x1", "#FEFEFE"), [X], "white");
    expect(stroke.toLowerCase()).not.toBe("#fefefe");
  });

  it("falls back to the raw stroke when the carrier is missing", () => {
    expect(resolveRouteStroke(routeFor("ghost", "#FFFFFF"), [], "green")).toBe("#FFFFFF");
  });
});

describe("resolveRouteStroke — other players are untouched on a white sheet", () => {
  it("leaves a saturated receiver's inherited route alone", () => {
    expect(resolveRouteStroke(routeFor("x1", "#FFFFFF"), [X], "white")).toBe(X.style.fill);
  });

  it("picks the right carrier out of a full roster", () => {
    const players = [QB, X];
    expect(resolveRouteStroke(routeFor("x1", "#FFFFFF"), players, "white")).toBe(X.style.fill);
    expect(resolveRouteStroke(routeFor("qb1", "#FFFFFF"), players, "white")).toBe(QB.style.stroke);
  });
});
