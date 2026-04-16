import type {
  Annotation,
  FormationSemantic,
  PathGeometry,
  Player,
  PlayMetadata,
  PlayTimeline,
  Point2,
  PrintProfile,
  Route,
  RouteSemantic,
} from "./types";

export type PlayCommand =
  | {
      type: "player.add";
      player: Player;
    }
  | {
      type: "player.move";
      playerId: string;
      position: Point2;
    }
  | {
      type: "player.remove";
      playerId: string;
    }
  | {
      type: "route.add";
      route: Route;
    }
  | {
      type: "route.setGeometry";
      routeId: string;
      geometry: PathGeometry;
    }
  | {
      type: "route.setSemantic";
      routeId: string;
      semantic: RouteSemantic | null;
    }
  | {
      type: "route.remove";
      routeId: string;
    }
  | {
      type: "annotation.upsert";
      annotation: Annotation;
    }
  | {
      type: "annotation.remove";
      annotationId: string;
    }
  | {
      type: "formation.set";
      semantic: FormationSemantic;
    }
  | {
      type: "document.setPrintProfile";
      printProfile: PrintProfile;
    }
  | {
      type: "document.setMetadata";
      patch: Partial<PlayMetadata>;
    }
  | {
      type: "document.flip";
      axis: "horizontal" | "vertical";
    }
  | {
      type: "document.setTimeline";
      timeline: PlayTimeline;
    };

export type CommandMeta = {
  id: string;
  clientId?: string;
  at: number;
};

export type TimestampedPlayCommand = PlayCommand & CommandMeta;
