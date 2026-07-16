import type { PlayCommand } from "./commands";
import type { PlayDocument, PlayerShape, Point2, RouteSegment } from "./types";
import { uid } from "./factory";
import { delaySecondsToSteps } from "./animation";

/**
 * Auto-note line written when a route delay is set/cleared via the editor.
 * Kept in lockstep with the value: when the coach changes or clears the delay
 * we look for the *exact* prior line and replace or remove it. If the coach
 * has hand-edited the line, the match fails and we leave their note alone
 * (no auto-overwrite of human edits).
 */
function delayAutoNoteLine(label: string, steps: number): string {
  const unit = steps === 1 ? "step" : "steps";
  return `@${label} waits ${steps} ${unit} before running route`;
}

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
          x: n.position.x + u.dx,
          y: n.position.y + u.dy,
        },
      })),
    };
  });

  return { players, routes };
}

/**
 * Convert a formation player's stored position into this play's coordinate
 * space. Formations are authored against a standard 25-yard window and their
 * own losY; the play may use different field settings, so positions travel
 * through "yards from LOS" space. Same transform `applyFormationPositions`
 * uses — factored out so the defensive replace path can't drift from it.
 */
function formationPositionToPlay(
  doc: PlayDocument,
  position: Point2,
  formationLosY: number,
): Point2 {
  const FORM_FIELD_LEN = 25;
  const playLosY = typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
  const playFieldLen = doc.sportProfile.fieldLengthYds;
  const yardsFromLos = (position.y - formationLosY) * FORM_FIELD_LEN;
  return {
    x: position.x, // x is width-relative; no transform needed
    y: Math.max(0, Math.min(1, playLosY + yardsFromLos / playFieldLen)),
  };
}

/**
 * What a `document.replaceDefensiveFormation` would destroy that the coach
 * cannot get back, so the UI can ask first — and stay silent otherwise.
 *
 * Deliberately does NOT count zones. Zones are REPLACED by the target
 * coverage's, not deleted, and on most defensive plays they were installed by
 * us at creation rather than drawn by the coach — warning about losing them
 * would be both untrue and a nag on every swap, which is how confirms get
 * trained away. Defender paths (blitz arrows, man lines) are the coach's own
 * work and have no equivalent in the target front, so they're the real loss.
 */
export function defensiveSwapDiscards(doc: PlayDocument): {
  defenderPaths: number;
  any: boolean;
} {
  const defenderPaths = doc.layers.routes.length;
  return { defenderPaths, any: defenderPaths > 0 };
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

      // Translate all nodes in routes owned by this player. Also translate
      // any manually-set quadratic control offsets on the route's segments
      // so curved segments move rigidly with the player instead of bending.
      const routes = doc.layers.routes.map((r) => {
        if (r.carrierPlayerId !== cmd.playerId) return r;
        return {
          ...r,
          nodes: r.nodes.map((n) => ({
            ...n,
            position: {
              x: n.position.x + dx,
              y: n.position.y + dy,
            },
          })),
          segments: r.segments.map((s) =>
            s.controlOffset
              ? {
                  ...s,
                  controlOffset: {
                    x: s.controlOffset.x + dx,
                    y: s.controlOffset.y + dy,
                  },
                }
              : s,
          ),
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
      const prev = doc.layers.players.find((p) => p.id === cmd.playerId);
      const oldLabel = prev?.label ?? "";
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, label: cmd.label } : p,
      );
      let metadata = doc.metadata;
      if (metadata.notes && oldLabel && oldLabel !== cmd.label) {
        const escaped = oldLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`@${escaped}(?![A-Za-z0-9])`, "g");
        const nextNotes = metadata.notes.replace(re, `@${cmd.label}`);
        if (nextNotes !== metadata.notes) {
          metadata = { ...metadata, notes: nextNotes };
        }
      }
      return { ...doc, layers: { ...doc.layers, players }, metadata };
    }
    case "player.setShape": {
      // star shape and isHotRoute are the same concept (Cal reads
      // isHotRoute; the renderer reads shape). Keep them synced from
      // every code path, not just `player.setHotRoute`, so the toolbar's
      // unified shape popover can dispatch a single command.
      const isHotRoute = cmd.shape === "star";
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, shape: cmd.shape, isHotRoute } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setStyle": {
      const prev = doc.layers.players.find((p) => p.id === cmd.playerId);
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, style: cmd.style } : p,
      );
      const fillChanged = prev?.style.fill !== cmd.style.fill;
      const routes = fillChanged
        ? doc.layers.routes.map((r) =>
            r.carrierPlayerId === cmd.playerId
              ? { ...r, style: { ...r.style, stroke: cmd.style.fill } }
              : r,
          )
        : doc.layers.routes;
      return { ...doc, layers: { ...doc.layers, players, routes } };
    }
    case "player.setRole": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId ? { ...p, role: cmd.role } : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setHotRoute": {
      const players = doc.layers.players.map((p) =>
        p.id === cmd.playerId
          ? { ...p, isHotRoute: cmd.isHotRoute, shape: (cmd.isHotRoute ? "star" : "circle") as PlayerShape }
          : p,
      );
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setBadgeText": {
      const text = cmd.text.trim().slice(0, 4);
      const players = doc.layers.players.map((p) => {
        if (p.id !== cmd.playerId) return p;
        // Empty text clears the manual override AND hides the badge.
        if (text.length === 0) {
          const { badge: _b, ...rest } = p;
          return { ...rest, badgeHidden: true };
        }
        return { ...p, badge: text, badgeHidden: false };
      });
      return { ...doc, layers: { ...doc.layers, players } };
    }
    case "player.setBadgeVisible": {
      const players = doc.layers.players.map((p) => {
        if (p.id !== cmd.playerId) return p;
        if (!cmd.visible) return { ...p, badgeHidden: true };
        // Showing: clear the hide flag. If there's nothing to display yet
        // (no manual text, no progression number), seed the next number so
        // the badge appears and can be edited.
        const hasText =
          (p.badge && p.badge.length > 0) || typeof p.progressionIndex === "number";
        if (hasText) return { ...p, badgeHidden: false };
        const used = doc.layers.players.filter(
          (q) =>
            !q.badgeHidden &&
            ((q.badge && q.badge.length > 0) || typeof q.progressionIndex === "number"),
        ).length;
        return { ...p, badge: String(used + 1), badgeHidden: false };
      });
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

    case "route.setStartDelaySec": {
      const prevRoute = doc.layers.routes.find((r) => r.id === cmd.routeId);
      if (!prevRoute) return doc;
      const carrier = doc.layers.players.find((p) => p.id === prevRoute.carrierPlayerId);
      const fieldLen = doc.sportProfile.fieldLengthYds;
      const oldSec = prevRoute.startDelaySec;
      const newSec = cmd.startDelaySec;
      const oldSteps = typeof oldSec === "number" && oldSec > 0
        ? delaySecondsToSteps(oldSec, fieldLen)
        : 0;
      const newSteps = typeof newSec === "number" && newSec > 0
        ? delaySecondsToSteps(newSec, fieldLen)
        : 0;

      const routes = doc.layers.routes.map((r) =>
        r.id === cmd.routeId
          ? { ...r, startDelaySec: newSteps > 0 ? newSec : undefined }
          : r,
      );

      let metadata = doc.metadata;
      if (carrier) {
        const oldLine = oldSteps > 0 ? delayAutoNoteLine(carrier.label, oldSteps) : null;
        const newLine = newSteps > 0 ? delayAutoNoteLine(carrier.label, newSteps) : null;
        const prevNotes = metadata.notes ?? "";
        if (oldLine && prevNotes.includes(oldLine)) {
          // Replace the prior auto-note line. When clearing (newLine null),
          // also strip a leading/trailing newline so we don't leave a gap.
          let nextNotes: string;
          if (newLine) {
            nextNotes = prevNotes.replace(oldLine, newLine);
          } else {
            nextNotes = prevNotes
              .replace(`\n${oldLine}`, "")
              .replace(`${oldLine}\n`, "")
              .replace(oldLine, "")
              .trim();
          }
          if (nextNotes !== prevNotes) {
            metadata = { ...metadata, notes: nextNotes || undefined };
          }
        } else if (newLine && !oldLine) {
          // Fresh delay — append. Prepend a newline only if there's existing text.
          const nextNotes = prevNotes ? `${prevNotes}\n${newLine}` : newLine;
          metadata = { ...metadata, notes: nextNotes };
        }
        // If oldLine exists but isn't found verbatim, the coach hand-edited
        // the line — leave their notes untouched.
      }

      return { ...doc, layers: { ...doc.layers, routes }, metadata };
    }

    case "route.setSpeed":
      // The route-level value is the default for every segment, so picking
      // 100% (1) here is equivalent to "clear" — store as undefined either
      // way. Always strips per-segment overrides so the chosen value applies
      // uniformly across the route.
      return mapRoute(doc, cmd.routeId, (r) => ({
        ...r,
        speedMultiplier:
          cmd.speedMultiplier === undefined || cmd.speedMultiplier === 1
            ? undefined
            : cmd.speedMultiplier,
        segments: r.segments.map((s) =>
          s.speedMultiplier !== undefined ? { ...s, speedMultiplier: undefined } : s,
        ),
      }));

    case "route.setSegmentSpeed":
      // Segment-level: undefined means "match the route default". An explicit
      // 100% here is preserved (it overrides a non-default route speed for
      // just this segment).
      return mapRoute(doc, cmd.routeId, (r) => ({
        ...r,
        segments: r.segments.map((s) =>
          s.id === cmd.segmentId
            ? { ...s, speedMultiplier: cmd.speedMultiplier }
            : s,
        ),
      }));

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

    case "document.setHashStyle":
      return { ...doc, hashStyle: cmd.hashStyle };

    case "document.setShowYardNumbers":
      return { ...doc, showYardNumbers: cmd.showYardNumbers };

    case "document.setLineOfScrimmage":
      return { ...doc, lineOfScrimmage: cmd.lineOfScrimmage };

    case "document.setFieldZone":
      return { ...doc, fieldZone: cmd.fieldZone };

    case "document.setRushLineYards":
      return { ...doc, rushLineYards: cmd.rushLineYards };

    case "document.setShowRushLine":
      return { ...doc, showRushLine: cmd.showRushLine };

    case "document.setFieldPositionYds":
      return { ...doc, fieldPositionYds: cmd.fieldPositionYds };

    case "document.setShowEndzones":
      return { ...doc, showEndzones: cmd.showEndzones };

    case "document.setShowNoRunZones":
      return { ...doc, showNoRunZones: cmd.showNoRunZones };

    case "document.setShowFirstDownLine":
      return { ...doc, showFirstDownLine: cmd.showFirstDownLine };

    case "document.setShowDownMarkers":
      return { ...doc, showDownMarkers: cmd.showDownMarkers };

    case "document.setRotatedYardNumbers":
      return { ...doc, rotatedYardNumbers: cmd.rotatedYardNumbers };

    case "document.setHashColumns":
      return { ...doc, hashColumns: cmd.hashColumns };

    case "document.setFirstDownLineYards":
      return { ...doc, firstDownLineYards: cmd.firstDownLineYards };

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

    case "document.replaceDefensiveFormation": {
      const metadata = {
        ...doc.metadata,
        formationId: cmd.formationId,
        formation: cmd.formationName,
        formationTag: null,
      };
      // Guard the invariant this case depends on: in a defensive play every
      // player in the document IS a defender (the opponent overlay lives in
      // separate editor state, never in doc.layers.players — see
      // EditorCanvas's isDefender check). If that ever stops holding, a
      // wholesale replace would silently delete the offense, so refuse
      // rather than corrupt the play.
      if (doc.metadata.playType !== "defense") return doc;

      const losY = cmd.formationLosY ?? 0.4;
      const players = cmd.players.map((p) => ({
        ...p,
        position: formationPositionToPlay(doc, p.position, losY),
      }));

      // Zones come from the TARGET coverage, so swapping to Tampa 2 draws
      // Tampa 2 — the same picture creating a play from Tampa 2 gives you.
      // Keeping the old front's zones would leave a Cover 2 shell around a
      // Tampa 2 front; clearing them outright would leave bare triangles and
      // make the same formation mean two different things depending on how
      // the coach got there. Empty is correct for man coverages and
      // coach-drawn formations, which have no coverage to install.
      //
      // Defender paths are dropped: routes are keyed by carrierPlayerId, and
      // those carriers no longer exist.
      return {
        ...doc,
        metadata,
        layers: { ...doc.layers, players, routes: [], zones: cmd.zones ?? [] },
      };
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
