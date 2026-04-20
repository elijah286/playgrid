import type { PlayCommand } from "./commands";
import type { PlayDocument, Point2, RouteSegment } from "./types";
import { uid } from "./factory";

/**
 * Formations store player positions in a specific coordinate system defined by
 * their `losY` (lineOfScrimmageY) and a standard 25-yard display window.
 * When applying formation positions to a play that may have different field
 * settings, we convert through "yards from LOS" space so positions are
 * always placed at the correct relative yardage.
 *
 * Also translates any routes carried by those players so routes stay
 * attached (same behaviour as player.move).
 */
function applyFormationPositions(
  doc: PlayDocument,
  formationPlayers: import("./types").Player[],
  formationLosY: number,
): { players: PlayDocument["layers"]["players"]; routes: PlayDocument["layers"]["routes"] } {
  const FORM_FIELD_LEN = 25; // all stored formations use the standard 25-yd window
  const playLosY = typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
  const playFieldLen = doc.sportProfile.fieldLengthYds;

  const fMap = new Map(formationPlayers.map((p) => [p.id, p]));

  // Compute new position and delta for every player that has a match in the formation.
  const updates = new Map<string, { newX: number; newY: number; dx: number; dy: number }>();
  for (const player of doc.layers.players) {
    const fp = fMap.get(player.id);
    if (!fp) continue;

    // Convert formation y → yards from formation LOS → play normalized y.
    const yardsFromLos = (fp.position.y - formationLosY) * FORM_FIELD_LEN;
    const newY = Math.max(0, Math.min(1, playLosY + yardsFromLos / playFieldLen));
    const newX = fp.position.x; // x is width-relative; no transform needed

    updates.set(player.id, {
      newX,
      newY,
      dx: newX - player.position.x,
      dy: newY - player.position.y,
    });
  }

  const players = doc.layers.players.map((p) => {
    const u = updates.get(p.id);
    return u ? { ...p, position: { x: u.newX, y: u.newY } } : p;
  });

  // Translate each player's routes by the same delta (keeps routes attached).
  const routes = doc.layers.routes.map((r) => {
    const u = updates.get(r.carrierPlayerId);
    if (!u || (Math.abs(u.dx) < 1e-9 && Math.abs(u.dy) < 1e-9)) return r;
    return {
      ...r,
      nodes: r.nodes.map((n) => ({
        ...n,
        position: {
          x: Math.min(1, Math.max(0, n.position.x + u.dx)),
          y: Math.min(1, Math.max(0, n.position.y + u.dy)),
        },
      })),
    };
  });

  return { players, routes };
}

function flipPoint(p: Point2, axis: "horizontal" | "vertical"): Point2 {
  if (axis === "horizontal") return { x: 1 - p.x, y: p.y };
  return { x: p.x, y: 1 - p.y };
}

function mapRoute(
  doc: PlayDocument,
  routeId: string,
  fn: (r: (typeof doc.layers.routes)[number]) => (typeof doc.layers.routes)[number],
): PlayDocument {
  return {
    ...doc,
    layers: {
      ...doc.layers,
      routes: doc.layers.routes.map((r) => (r.id === routeId ? fn(r) : r)),
    },
  };
}

export function applyCommand(doc: PlayDocument, cmd: PlayCommand): PlayDocument {
  switch (cmd.type) {
    /* ---- Players ---- */
    case "player.add":
      return {
        ...doc,
        layers: { ...doc.layers, players: [...doc.layers.players, cmd.player] },
      };
    case "player.move": {
      // Find the player's current position to compute delta
      const movingPlayer = doc.layers.players.find((p) => p.id === cmd.playerId);
      const dx = movingPlayer ? cmd.position.x - movingPlayer.position.x : 0;
      const dy = movingPlayer ? cmd.position.y - movingPlayer.position.y : 0;

      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, position: cmd.position } : p,
      );

      // Translate all nodes in routes owned by this player
      const routes = doc.layers.routes.map((r) => {
        if (r.carrierPlayerId !== cmd.playerId) return r;
        return {
          ...r,
          nodes: r.nodes.map((n) => ({
            ...n,
            position: {
              x: Math.min(1, Math.max(0, n.position.x + dx)),
              y: Math.min(1, Math.max(0, n.position.y + dy)),
            },
          })),
        };
      });

      return { ...doc, layers: { ...doc.layers, players, routes } };
    }
    case "player.remove":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          players: doc.layers.players.filter((p) => p.id !== cmd.playerId),
          routes: doc.layers.routes.filter((r) => r.carrierPlayerId !== cmd.playerId),
        },
      };
    case "player.setLabel": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, label: cmd.label } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setShape": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, shape: cmd.shape } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setStyle": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, style: cmd.style } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setRole": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, role: cmd.role } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setHotRoute": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, isHotRoute: cmd.isHotRoute } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.clearRoutes":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          routes: doc.layers.routes.filter((r) => r.carrierPlayerId !== cmd.playerId),
        },
      };
    case "player.flipRoutes": {
      const player = doc.layers.players.find((p) => p.id === cmd.playerId);
      if (!player) return doc;
      const px = player.position.x;
      const flipX = (x: number) => Math.min(1, Math.max(0, 2 * px - x));
      const routes = doc.layers.routes.map((r) => {
        if (r.carrierPlayerId !== cmd.playerId) return r;
        return {
          ...r,
          nodes: r.nodes.map((n) => ({
            ...n,
            position: { x: flipX(n.position.x), y: n.position.y },
          })),
          segments: r.segments.map((s) => ({
            ...s,
            controlOffset: s.controlOffset
              ? { x: flipX(s.controlOffset.x), y: s.controlOffset.y }
              : null,
          })),
        };
      });
      return { ...doc, layers: { ...doc.layers, routes } };
    }

    /* ---- Route-level ---- */
    case "route.add":
      return {
        ...doc,
        layers: { ...doc.layers, routes: [...doc.layers.routes, cmd.route] },
      };
    case "route.remove":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          routes: doc.layers.routes.filter((r) => r.id !== cmd.routeId),
        },
      };
    case "route.setSemantic":
      return mapRoute(doc, cmd.routeId, (r) => ({ ...r, semantic: cmd.semantic }));
    case "route.setStyle":
      return mapRoute(doc, cmd.routeId, (r) => ({ ...r, style: cmd.style }));
    case "route.setEndDecoration":
      return mapRoute(doc, cmd.routeId, (r) => ({ ...r, endDecoration: cmd.endDecoration }));

    /* ---- Node-level ---- */
    case "route.addNode":
      return mapRoute(doc, cmd.routeId, (r) => {
        const nodes = [...r.nodes, cmd.node];
        let segments = r.segments;
        if (cmd.afterNodeId) {
          const seg: RouteSegment = {
            id: uid("seg"),
            fromNodeId: cmd.afterNodeId,
            toNodeId: cmd.node.id,
            shape: cmd.shape ?? "straight",
            strokePattern: cmd.strokePattern ?? "solid",
            controlOffset: null,
          };
          segments = [...segments, seg];
        }
        return { ...r, nodes, segments };
      });

    case "route.moveNode":
      return mapRoute(doc, cmd.routeId, (r) => ({
        ...r,
        nodes: r.nodes.map((n) =>
          n.id === cmd.nodeId ? { ...n, position: cmd.position } : n,
        ),
      }));

    case "route.removeNode":
      return mapRoute(doc, cmd.routeId, (r) => ({
        ...r,
        nodes: r.nodes.filter((n) => n.id !== cmd.nodeId),
        segments: r.segments.filter(
          (s) => s.fromNodeId !== cmd.nodeId && s.toNodeId !== cmd.nodeId,
        ),
      }));

    case "route.removeNodeBridging":
      return mapRoute(doc, cmd.routeId, (r) => {
        const incoming = r.segments.filter((s) => s.toNodeId === cmd.nodeId);
        const outgoing = r.segments.filter((s) => s.fromNodeId === cmd.nodeId);
        // Only bridge when there's exactly one in and one out; otherwise
        // fall back to plain removal (endpoints, forks).
        if (incoming.length === 1 && outgoing.length === 1) {
          const inSeg = incoming[0];
          const outSeg = outgoing[0];
          const bridged: RouteSegment = {
            id: uid("seg"),
            fromNodeId: inSeg.fromNodeId,
            toNodeId: outSeg.toNodeId,
            shape: inSeg.shape,
            strokePattern: inSeg.strokePattern,
            controlOffset: null,
          };
          return {
            ...r,
            nodes: r.nodes.filter((n) => n.id !== cmd.nodeId),
            segments: [
              ...r.segments.filter(
                (s) => s.id !== inSeg.id && s.id !== outSeg.id,
              ),
              bridged,
            ],
          };
        }
        return {
          ...r,
          nodes: r.nodes.filter((n) => n.id !== cmd.nodeId),
          segments: r.segments.filter(
            (s) => s.fromNodeId !== cmd.nodeId && s.toNodeId !== cmd.nodeId,
          ),
        };
      });

    case "route.insertNode":
      return mapRoute(doc, cmd.routeId, (r) => {
        const oldSeg = r.segments.find((s) => s.id === cmd.segmentId);
        if (!oldSeg) return r;
        const seg1: RouteSegment = {
          id: uid("seg"),
          fromNodeId: oldSeg.fromNodeId,
          toNodeId: cmd.node.id,
          shape: oldSeg.shape,
          strokePattern: oldSeg.strokePattern,
          controlOffset: null,
        };
        const seg2: RouteSegment = {
          id: uid("seg"),
          fromNodeId: cmd.node.id,
          toNodeId: oldSeg.toNodeId,
          shape: oldSeg.shape,
          strokePattern: oldSeg.strokePattern,
          controlOffset: null,
        };
        return {
          ...r,
          nodes: [...r.nodes, cmd.node],
          segments: [...r.segments.filter((s) => s.id !== cmd.segmentId), seg1, seg2],
        };
      });

    /* ---- Branch ---- */
    case "route.addBranch":
      return mapRoute(doc, cmd.routeId, (r) => {
        const seg: RouteSegment = {
          id: uid("seg"),
          fromNodeId: cmd.fromNodeId,
          toNodeId: cmd.toNode.id,
          shape: cmd.shape ?? "straight",
          strokePattern: cmd.strokePattern ?? "solid",
          controlOffset: null,
        };
        return {
          ...r,
          nodes: [...r.nodes, cmd.toNode],
          segments: [...r.segments, seg],
        };
      });

    /* ---- Segment-level ---- */
    case "route.setSegmentShape":
      return mapRoute(doc, cmd.routeId, (r) => ({
        ...r,
        segments: r.segments.map((s) =>
          s.id === cmd.segmentId ? { ...s, shape: cmd.shape, controlOffset: null } : s,
        ),
      }));

    case "route.setSegmentStroke":
      return mapRoute(doc, cmd.routeId, (r) => ({
        ...r,
        segments: r.segments.map((s) =>
          s.id === cmd.segmentId ? { ...s, strokePattern: cmd.strokePattern } : s,
        ),
      }));

    case "route.setSegmentControl":
      return mapRoute(doc, cmd.routeId, (r) => ({
        ...r,
        segments: r.segments.map((s) =>
          s.id === cmd.segmentId ? { ...s, controlOffset: cmd.controlOffset } : s,
        ),
      }));

    /* ---- Annotations ---- */
    case "annotation.upsert": {
      const others = doc.layers.annotations.filter((a) => a.id !== cmd.annotation.id);
      return {
        ...doc,
        layers: { ...doc.layers, annotations: [...others, cmd.annotation] },
      };
    }
    case "annotation.remove":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          annotations: doc.layers.annotations.filter((a) => a.id !== cmd.annotationId),
        },
      };

    /* ---- Zones ---- */
    case "zone.add":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          zones: [...(doc.layers.zones ?? []), cmd.zone],
        },
      };
    case "zone.remove":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          zones: (doc.layers.zones ?? []).filter((z) => z.id !== cmd.zoneId),
        },
      };
    case "zone.update":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          zones: (doc.layers.zones ?? []).map((z) =>
            z.id === cmd.zoneId ? { ...z, ...cmd.patch } : z,
          ),
        },
      };

    /* ---- Formation ---- */
    case "formation.set":
      return { ...doc, formation: { ...doc.formation, semantic: cmd.semantic } };

    /* ---- Document ---- */
    case "document.setPrintProfile":
      return { ...doc, printProfile: cmd.printProfile };
    case "document.setMetadata":
      return { ...doc, metadata: { ...doc.metadata, ...cmd.patch } };
    case "document.setSportProfile":
      return { ...doc, sportProfile: { ...doc.sportProfile, ...cmd.patch } };
    case "document.setTimeline":
      return { ...doc, timeline: cmd.timeline };

    case "document.setFieldBackground":
      return { ...doc, fieldBackground: cmd.background };

    case "document.setShowHashMarks":
      return { ...doc, showHashMarks: cmd.showHashMarks };

    case "document.setShowYardNumbers":
      return { ...doc, showYardNumbers: cmd.showYardNumbers };

    case "document.setLineOfScrimmage":
      return { ...doc, lineOfScrimmage: cmd.lineOfScrimmage };

    case "document.setFieldZone":
      return { ...doc, fieldZone: cmd.fieldZone };

    case "document.setFormationLink": {
      const metadata = {
        ...doc.metadata,
        formationId: cmd.formationId,
        formation: cmd.formationName,
        formationTag: null,
      };
      // Optionally snap player positions to the new formation (change formation).
      if (!cmd.players || cmd.players.length === 0) {
        return { ...doc, metadata, layers: doc.layers };
      }
      const { players, routes } = applyFormationPositions(
        doc,
        cmd.players,
        cmd.formationLosY ?? 0.4,
      );
      return { ...doc, metadata, layers: { ...doc.layers, players, routes } };
    }

    case "document.setFormationTag":
      return {
        ...doc,
        metadata: { ...doc.metadata, formationTag: cmd.formationTag },
      };

    case "document.reapplyFormation": {
      const { players, routes } = applyFormationPositions(
        doc,
        cmd.players,
        cmd.formationLosY,
      );
      return {
        ...doc,
        metadata: { ...doc.metadata, formationTag: null },
        layers: { ...doc.layers, players, routes },
      };
    }

    case "field.setYardage": {
      const clampYards = (v: number, lo: number, hi: number) =>
        Math.max(lo, Math.min(hi, Math.round(v)));
      const bk = clampYards(cmd.backfieldYards, 2, 30);
      const dn = clampYards(cmd.downfieldYards, 5, 50);
      const newTotal = bk + dn;
      const newLosY = bk / newTotal;

      const oldTotal = doc.sportProfile.fieldLengthYds;
      const oldLosY = typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;

      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
      const scaleY = (y: number) =>
        clamp01(newLosY + ((y - oldLosY) * oldTotal) / newTotal);

      return {
        ...doc,
        lineOfScrimmageY: newLosY,
        sportProfile: { ...doc.sportProfile, fieldLengthYds: newTotal },
        layers: {
          players: doc.layers.players.map((p) => ({
            ...p,
            position: { x: p.position.x, y: scaleY(p.position.y) },
          })),
          routes: doc.layers.routes.map((r) => ({
            ...r,
            nodes: r.nodes.map((n) => ({
              ...n,
              position: { x: n.position.x, y: scaleY(n.position.y) },
            })),
            // controlOffset is a relative delta from segment midpoint — no rescaling needed
            segments: r.segments,
          })),
          annotations: doc.layers.annotations.map((a) => ({
            ...a,
            anchor: { x: a.anchor.x, y: scaleY(a.anchor.y) },
          })),
        },
      };
    }

    case "document.flip": {
      const axis = cmd.axis;
      return {
        ...doc,
        formation: {
          ...doc.formation,
          layout: {
            ...doc.formation.layout,
            playerAnchors: Object.fromEntries(
              Object.entries(doc.formation.layout.playerAnchors).map(([k, v]) => [
                k,
                flipPoint(v, axis),
              ]),
            ),
          },
        },
        layers: {
          players: doc.layers.players.map((p) => ({
            ...p,
            position: flipPoint(p.position, axis),
          })),
          routes: doc.layers.routes.map((r) => ({
            ...r,
            nodes: r.nodes.map((n) => ({
              ...n,
              position: flipPoint(n.position, axis),
            })),
            segments: r.segments.map((s) => ({
              ...s,
              controlOffset: s.controlOffset
                ? flipPoint(s.controlOffset, axis)
                : null,
            })),
          })),
          annotations: doc.layers.annotations.map((a) => ({
            ...a,
            anchor: flipPoint(a.anchor, axis),
          })),
        },
      };
    }
  }
}

export function applyCommands(doc: PlayDocument, cmds: PlayCommand[]): PlayDocument {
  return cmds.reduce(applyCommand, doc);
}
