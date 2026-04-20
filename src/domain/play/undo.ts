import type { PlayCommand } from "./commands";
import type { PlayDocument } from "./types";
import { applyCommand } from "./reducer";

const MAX_UNDO = 80;

export type UndoState = {
  past: PlayDocument[];
  present: PlayDocument;
  future: PlayDocument[];
  /**
   * Key of the last command that produced `present`, used to coalesce
   * repeated drag events into a single undo entry (e.g. player.move/playerId).
   * Null means the next dispatch must push to past.
   */
  lastTransientKey: string | null;
};

export function createUndoState(initial: PlayDocument): UndoState {
  return { past: [], present: initial, future: [], lastTransientKey: null };
}

/** Returns a coalesce key for drag-style commands, or null for commands
 * that should each produce their own undo entry. */
function transientKey(cmd: PlayCommand): string | null {
  switch (cmd.type) {
    case "player.move":
      return `player.move:${cmd.playerId}`;
    case "zone.update":
      return `zone.update:${cmd.zoneId}`;
    case "route.moveNode":
      return `route.moveNode:${cmd.routeId}:${cmd.nodeId}`;
    case "route.setSegmentControl":
      return `route.setSegmentControl:${cmd.routeId}:${cmd.segmentId}`;
    default:
      return null;
  }
}

export function dispatchCommand(
  state: UndoState,
  cmd: PlayCommand,
): UndoState {
  const next = applyCommand(state.present, cmd);
  const key = transientKey(cmd);
  // Coalesce: if this is a drag event of the same key as the previous
  // dispatch, don't push a new past entry — just update present.
  if (key !== null && state.lastTransientKey === key) {
    return {
      past: state.past,
      present: next,
      future: [],
      lastTransientKey: key,
    };
  }
  const past = [...state.past, state.present];
  const trimmed = past.length > MAX_UNDO ? past.slice(past.length - MAX_UNDO) : past;
  return {
    past: trimmed,
    present: next,
    future: [],
    lastTransientKey: key,
  };
}

export function undo(state: UndoState): UndoState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  const past = state.past.slice(0, -1);
  return {
    past,
    present: previous,
    future: [state.present, ...state.future],
    lastTransientKey: null,
  };
}

export function redo(state: UndoState): UndoState {
  if (state.future.length === 0) return state;
  const [next, ...future] = state.future;
  return {
    past: [...state.past, state.present],
    present: next,
    future,
    lastTransientKey: null,
  };
}
