import type { PlayCommand } from "./commands";
import type { PlayDocument, Point2 } from "./types";

function flipPoint(p: Point2, axis: "horizontal" | "vertical"): Point2 {
  if (axis === "horizontal") return { x: 1 - p.x, y: p.y };
  return { x: p.x, y: 1 - p.y };
}

export function applyCommand(doc: PlayDocument, cmd: PlayCommand): PlayDocument {
  switch (cmd.type) {
    case "player.add":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          players: [...doc.layers.players, cmd.player],
        },
      };
    case "player.move": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, position: cmd.position } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
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
    case "route.add":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          routes: [...doc.layers.routes, cmd.route],
        },
      };
    case "route.setGeometry": {
      const routes = doc.layers.routes.map((r) =>
        r.id === cmd.routeId ? { ...r, geometry: cmd.geometry } : r,
      );
      return { ...doc, layers: { ...doc.layers, routes } };
    }
    case "route.setSemantic": {
      const routes = doc.layers.routes.map((r) =>
        r.id === cmd.routeId ? { ...r, semantic: cmd.semantic } : r,
      );
      return { ...doc, layers: { ...doc.layers, routes } };
    }
    case "route.remove":
      return {
        ...doc,
        layers: {
          ...doc.layers,
          routes: doc.layers.routes.filter((r) => r.id !== cmd.routeId),
        },
      };
    case "annotation.upsert": {
      const others = doc.layers.annotations.filter((a) => a.id !== cmd.annotation.id);
      return {
        ...doc,
        layers: {
          ...doc.layers,
          annotations: [...others, cmd.annotation],
        },
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
    case "formation.set":
      return {
        ...doc,
        formation: {
          ...doc.formation,
          semantic: cmd.semantic,
        },
      };
    case "document.setPrintProfile":
      return { ...doc, printProfile: cmd.printProfile };
    case "document.setMetadata":
      return { ...doc, metadata: { ...doc.metadata, ...cmd.patch } };
    case "document.setTimeline":
      return { ...doc, timeline: cmd.timeline };
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
            geometry: {
              ...r.geometry,
              segments: r.geometry.segments.map((s) => {
                if (s.type === "line") {
                  return {
                    ...s,
                    from: flipPoint(s.from, axis),
                    to: flipPoint(s.to, axis),
                  };
                }
                return {
                  ...s,
                  from: flipPoint(s.from, axis),
                  control: flipPoint(s.control, axis),
                  to: flipPoint(s.to, axis),
                };
              }),
            },
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
