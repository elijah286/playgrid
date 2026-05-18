// Round-trip + side-mirror tests for user-defined route templates.
//
// Contract:
//   1. normalizeRouteToTemplate → instantiateUserTemplate on the SAME side
//      returns geometry within float-precision of the original route.
//   2. Save on RIGHT, instantiate on LEFT (or vice versa) produces a mirrored
//      route — same shape, flipped across the field midline. This is the
//      "directional" behavior coaches expect: a save-from-right-WR slant
//      should still slant *toward* the QB when applied to a left-side WR.
//   3. Style is captured verbatim — no merge with editor defaults.
//   4. Per-segment shape ("straight" / "curve") survives the round trip.

import { describe, expect, it } from "vitest";
import {
  instantiateUserTemplate,
  normalizeRouteToTemplate,
  type UserRouteTemplate,
} from "./userRouteTemplates";
import type { Route } from "./types";

function buildRoute(opts: {
  playerPos: { x: number; y: number };
  nodes: { x: number; y: number }[];
  shapes?: ("straight" | "curve" | "zigzag")[];
  strokePatterns?: ("solid" | "dashed" | "dotted" | "motion")[];
  style?: { stroke: string; strokeWidth: number; dash?: string };
}): Route {
  const nodes = opts.nodes.map((p, i) => ({
    id: `n${i}`,
    position: { ...p },
  }));
  const segments = nodes.slice(1).map((_, i) => ({
    id: `s${i}`,
    fromNodeId: nodes[i].id,
    toNodeId: nodes[i + 1].id,
    shape: opts.shapes?.[i] ?? ("straight" as const),
    strokePattern: opts.strokePatterns?.[i] ?? ("solid" as const),
    controlOffset: null,
  }));
  return {
    id: "r",
    carrierPlayerId: "p1",
    semantic: null,
    nodes,
    segments,
    style: opts.style ?? { stroke: "#FFFFFF", strokeWidth: 2.5 },
  };
}

function close(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

describe("userRouteTemplates round-trip", () => {
  it("preserves geometry when saved and re-applied on the same side", () => {
    // Right-side WR running a Slant-shaped route.
    const playerPos = { x: 0.75, y: 0.5 };
    const route = buildRoute({
      playerPos,
      nodes: [
        playerPos,
        { x: 0.75, y: 0.62 },
        { x: 0.55, y: 0.732 },
      ],
      shapes: ["straight", "straight"],
    });

    const norm = normalizeRouteToTemplate(route, playerPos);
    const template: UserRouteTemplate = {
      id: "u1",
      name: "My slant",
      ...norm,
      createdAt: "2026-05-18T00:00:00Z",
    };
    const reinstanced = instantiateUserTemplate(template, playerPos, "p1");

    // Same number of nodes, same geometry (within float epsilon).
    expect(reinstanced.nodes.length).toBe(route.nodes.length);
    for (let i = 0; i < route.nodes.length; i++) {
      expect(close(reinstanced.nodes[i].position.x, route.nodes[i].position.x)).toBe(true);
      expect(close(reinstanced.nodes[i].position.y, route.nodes[i].position.y)).toBe(true);
    }
    expect(reinstanced.segments.map((s) => s.shape)).toEqual(["straight", "straight"]);
  });

  it("mirrors across the field when applied to the opposite side", () => {
    // Saved from RIGHT side (x=0.75), running 0.20 toward the inside.
    const savePos = { x: 0.75, y: 0.5 };
    const route = buildRoute({
      playerPos: savePos,
      nodes: [
        savePos,
        { x: 0.55, y: 0.732 }, // 0.20 to the LEFT in absolute coords = INSIDE for a right WR
      ],
    });

    const norm = normalizeRouteToTemplate(route, savePos);
    const template: UserRouteTemplate = {
      id: "u1",
      name: "Inside cross",
      ...norm,
      createdAt: "2026-05-18T00:00:00Z",
    };

    // Apply to a LEFT-side WR. The route should now bend toward the RIGHT
    // (which is INSIDE for them) — same semantic meaning, mirrored geometry.
    const leftPos = { x: 0.25, y: 0.5 };
    const reinstanced = instantiateUserTemplate(template, leftPos, "p2");

    // Start at the new player's position
    expect(close(reinstanced.nodes[0].position.x, leftPos.x)).toBe(true);
    // End at x=0.45 (0.25 + 0.20 to the right = the mirror of 0.55 for left side)
    expect(close(reinstanced.nodes[1].position.x, 0.45)).toBe(true);
    expect(close(reinstanced.nodes[1].position.y, 0.732)).toBe(true);
  });

  it("preserves style verbatim and does not adopt editor defaults", () => {
    const playerPos = { x: 0.75, y: 0.5 };
    const route = buildRoute({
      playerPos,
      nodes: [playerPos, { x: 0.75, y: 0.7 }],
      style: { stroke: "#F26522", strokeWidth: 4, dash: "6 4" },
    });

    const norm = normalizeRouteToTemplate(route, playerPos);
    expect(norm.style).toEqual({ stroke: "#F26522", strokeWidth: 4, dash: "6 4" });

    const template: UserRouteTemplate = {
      id: "u1",
      name: "Dashed go",
      ...norm,
      createdAt: "2026-05-18T00:00:00Z",
    };
    const reinstanced = instantiateUserTemplate(template, playerPos, "p1");
    expect(reinstanced.style.stroke).toBe("#F26522");
    expect(reinstanced.style.strokeWidth).toBe(4);
    expect(reinstanced.style.dash).toBe("6 4");
  });

  it("preserves per-segment shape (curve vs straight) through round-trip", () => {
    const playerPos = { x: 0.5, y: 0.5 };
    const route = buildRoute({
      playerPos,
      nodes: [
        playerPos,
        { x: 0.5, y: 0.7 },
        { x: 0.7, y: 0.85 },
      ],
      shapes: ["straight", "curve"],
    });

    const norm = normalizeRouteToTemplate(route, playerPos);
    expect(norm.shapes).toEqual(["straight", "curve"]);

    const template: UserRouteTemplate = {
      id: "u1",
      name: "Wheel-ish",
      ...norm,
      createdAt: "2026-05-18T00:00:00Z",
    };
    const reinstanced = instantiateUserTemplate(template, playerPos, "p1");
    expect(reinstanced.segments.map((s) => s.shape)).toEqual(["straight", "curve"]);
  });

  it("preserves per-segment stroke pattern (dashed = blocking)", () => {
    const playerPos = { x: 0.5, y: 0.5 };
    const route = buildRoute({
      playerPos,
      nodes: [playerPos, { x: 0.5, y: 0.55 }],
      strokePatterns: ["dashed"],
    });

    const norm = normalizeRouteToTemplate(route, playerPos);
    expect(norm.strokePatterns).toEqual(["dashed"]);

    const template: UserRouteTemplate = {
      id: "u1",
      name: "Pass block",
      ...norm,
      createdAt: "2026-05-18T00:00:00Z",
    };
    const reinstanced = instantiateUserTemplate(template, playerPos, "p1");
    expect(reinstanced.segments[0].strokePattern).toBe("dashed");
  });
});
