import type {
  Annotation,
  EndDecoration,
  FormationSemantic,
  Player,
  PlayerRole,
  PlayerShape,
  PlayerStyle,
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
  Zone,
} from "./types";

export type PlayCommand =
  | { type: "player.add"; player: Player }
  | { type: "player.move"; playerId: string; position: Point2 }
  | { type: "player.remove"; playerId: string }
  | { type: "player.setLabel"; playerId: string; label: string }
  | { type: "player.setShape"; playerId: string; shape: PlayerShape }
  | { type: "player.setStyle"; playerId: string; style: PlayerStyle }
  | { type: "player.setRole"; playerId: string; role: PlayerRole }
  | { type: "player.setHotRoute"; playerId: string; isHotRoute: boolean }
  | { type: "player.setBadgeText"; playerId: string; text: string }
  | { type: "player.setBadgeVisible"; playerId: string; visible: boolean }
  | { type: "player.clearRoutes"; playerId: string }
  | {
      /** Mirror all route nodes for this player's routes over the vertical axis
       *  through the player's x position (i.e. flip left↔right around the player). */
      type: "player.flipRoutes";
      playerId: string;
    }
  /* ---- Route-level ---- */
  | { type: "route.add"; route: Route }
  | { type: "route.remove"; routeId: string }
  | { type: "route.setSemantic"; routeId: string; semantic: RouteSemantic | null }
  | { type: "route.setStyle"; routeId: string; style: RouteStyle }
  | { type: "route.setEndDecoration"; routeId: string; endDecoration: EndDecoration }
  | {
      /**
       * Set (or clear, when undefined) a route's playback delay. Stored in
       * seconds on `Route.startDelaySec`; the editor UI exposes this in
       * "steps" where 1 step = 1 yard at default playback speed.
       */
      type: "route.setStartDelaySec";
      routeId: string;
      startDelaySec: number | undefined;
    }
  | {
      /**
       * Set (or clear, when undefined) the route-wide speed multiplier.
       * Also clears any per-segment overrides so the player-level value
       * applies uniformly across the route.
       */
      type: "route.setSpeed";
      routeId: string;
      speedMultiplier: number | undefined;
    }
  | {
      /**
       * Set (or clear, when undefined) a single segment's speed multiplier.
       * When undefined, the segment falls back to the route-wide value.
       */
      type: "route.setSegmentSpeed";
      routeId: string;
      segmentId: string;
      speedMultiplier: number | undefined;
    }
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
  | { type: "route.removeNodeBridging"; routeId: string; nodeId: string }
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
  /* ---- Zones (defensive coverage) ---- */
  | { type: "zone.add"; zone: Zone }
  | { type: "zone.remove"; zoneId: string }
  | { type: "zone.update"; zoneId: string; patch: Partial<Omit<Zone, "id">> }
  /* ---- Formation ---- */
  | { type: "formation.set"; semantic: FormationSemantic }
  /* ---- Document ---- */
  | { type: "document.setPrintProfile"; printProfile: PrintProfile }
  | { type: "document.setMetadata"; patch: Partial<PlayMetadata> }
  | { type: "document.flip"; axis: "horizontal" | "vertical" }
  | { type: "document.setSportProfile"; patch: Partial<SportProfile> }
  | { type: "document.setTimeline"; timeline: PlayTimeline }
  | { type: "document.setFieldBackground"; background: "green" | "white" | "black" | "gray" }
  | { type: "document.setShowHashMarks"; showHashMarks: boolean }
  | { type: "document.setHashStyle"; hashStyle: "narrow" | "normal" | "wide" | "none" }
  | { type: "document.setShowYardNumbers"; showYardNumbers: boolean }
  | { type: "document.setLineOfScrimmage"; lineOfScrimmage: "line" | "football" | "none" }
  | { type: "document.setFieldZone"; fieldZone: "midfield" | "red_zone" }
  | { type: "document.setRushLineYards"; rushLineYards: number }
  | { type: "document.setShowRushLine"; showRushLine: boolean }
  | { type: "document.setFieldPositionYds"; fieldPositionYds: number }
  | { type: "document.setShowEndzones"; showEndzones: boolean }
  | { type: "document.setShowNoRunZones"; showNoRunZones: boolean }
  | { type: "document.setShowFirstDownLine"; showFirstDownLine: boolean }
  | { type: "document.setShowDownMarkers"; showDownMarkers: boolean }
  | { type: "document.setRotatedYardNumbers"; rotatedYardNumbers: boolean }
  | { type: "document.setHashColumns"; hashColumns: [number, number] | undefined }
  | { type: "document.setFirstDownLineYards"; firstDownLineYards: number | undefined }
  | {
      type: "document.setFormationLink";
      formationId: string | null;
      formationName: string;
      /** When provided, snap player positions to these formation players (by id). */
      players?: Player[];
      /** lineOfScrimmageY of the source formation — used to transform positions. */
      formationLosY?: number;
    }
  | {
      /**
       * Swap a DEFENSIVE play onto a different formation.
       *
       * Not a variant of setFormationLink: for offense, changing formation is a
       * relocation — the same WRs stand somewhere else, so positions are matched
       * by player id and routes ride along. Defensive fronts don't work that way.
       * 4-3 Over and 3-4 don't share a linebacker between them, and even 5v5 Base
       * and Cover 2 have only 3 of 5 defenders in common, because a defensive
       * alignment is a personnel decision, not an arrangement of fixed personnel.
       *
       * So this replaces `players` wholesale, and drops the defender paths that
       * described the OLD front's assignments. Callers must confirm with the
       * coach first when there is work to lose — see `defensiveSwapDiscards`.
       */
      type: "document.replaceDefensiveFormation";
      formationId: string | null;
      formationName: string;
      /** The target formation's defenders. Replaces doc.layers.players entirely. */
      players: Player[];
      /**
       * The target coverage's zones, derived from the catalog by the caller.
       * Replaces doc.layers.zones outright — swapping to Tampa 2 should draw
       * Tampa 2, exactly as creating a play from Tampa 2 does. Empty for
       * man coverages (which draw no zones) and for coach-drawn formations
       * (which carry none), so those correctly end up with a bare front.
       */
      zones?: Zone[];
      /** lineOfScrimmageY of the source formation — used to transform positions. */
      formationLosY?: number;
    }
  | { type: "document.setFormationTag"; formationTag: string | null }
  | {
      /** Snap all player positions back to the linked formation's canonical layout. */
      type: "document.reapplyFormation";
      players: Player[];
      /** lineOfScrimmageY of the formation — used to convert positions into play coords. */
      formationLosY: number;
    }
  | {
      /**
       * Change the yards shown above and below the LOS.
       * Rescales all player/route/annotation y-coordinates so every element
       * retains its real yardage distance from the line of scrimmage.
       */
      type: "field.setYardage";
      backfieldYards: number;
      downfieldYards: number;
    };

export type CommandMeta = {
  id: string;
  clientId?: string;
  at: number;
};

export type TimestampedPlayCommand = PlayCommand & CommandMeta;
