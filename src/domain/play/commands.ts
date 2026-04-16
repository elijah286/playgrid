import type {
  Annotation,
  FormationSemantic,
  Player,
  PlayMetadata,
  PlayTimeline,
  Point2,
  PrintProfile,
  Route,
  RouteNode,
  RouteSemantic,
  RouteStyle,
  SegmentShape,
  SportProfile,
  StrokePattern,
} from "./types";

export type PlayCommand =
  | { type: "player.add"; player: Player }
  | { type: "player.move"; playerId: string; position: Point2 }
  | { type: "player.remove"; playerId: string }
  /* ---- Route-level ---- */
  | { type: "route.add"; route: Route }
  | { type: "route.remove"; routeId: string }
  | { type: "route.setSemantic"; routeId: string; semantic: RouteSemantic | null }
  | { type: "route.setStyle"; routeId: string; style: RouteStyle }
  /* ---- Node-level ---- */
  | {
      type: "route.addNode";
      routeId: string;
      node: RouteNode;
      /** If set, creates a segment from this node to the new node */
      afterNodeId?: string;
      shape?: SegmentShape;
      strokePattern?: StrokePattern;
    }
  | { type: "route.moveNode"; routeId: string; nodeId: string; position: Point2 }
  | { type: "route.removeNode"; routeId: string; nodeId: string }
  | {
      /** Split an existing segment by inserting a node at its midpoint */
      type: "route.insertNode";
      routeId: string;
      segmentId: string;
      node: RouteNode;
    }
  /* ---- Branch ---- */
  | {
      type: "route.addBranch";
      routeId: string;
      fromNodeId: string;
      toNode: RouteNode;
      shape?: SegmentShape;
      strokePattern?: StrokePattern;
    }
  /* ---- Segment-level ---- */
  | { type: "route.setSegmentShape"; routeId: string; segmentId: string; shape: SegmentShape }
  | { type: "route.setSegmentStroke"; routeId: string; segmentId: string; strokePattern: StrokePattern }
  | { type: "route.setSegmentControl"; routeId: string; segmentId: string; controlOffset: Point2 | null }
  /* ---- Annotations ---- */
  | { type: "annotation.upsert"; annotation: Annotation }
  | { type: "annotation.remove"; annotationId: string }
  /* ---- Formation ---- */
  | { type: "formation.set"; semantic: FormationSemantic }
  /* ---- Document ---- */
  | { type: "document.setPrintProfile"; printProfile: PrintProfile }
  | { type: "document.setMetadata"; patch: Partial<PlayMetadata> }
  | { type: "document.flip"; axis: "horizontal" | "vertical" }
  | { type: "document.setSportProfile"; patch: Partial<SportProfile> }
  | { type: "document.setTimeline"; timeline: PlayTimeline };

export type CommandMeta = {
  id: string;
  clientId?: string;
  at: number;
};

export type TimestampedPlayCommand = PlayCommand & CommandMeta;
