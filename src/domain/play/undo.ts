import type { PlayCommand } from "./commands";
import type { PlayDocument } from "./types";
import { applyCommand } from "./reducer";

const MAX_UNDO = 80;

export type UndoState = {
  past: PlayDocument[];
  present: PlayDocument;
  future: PlayDocument[];
};

export function createUndoState(initial: PlayDocument): UndoState {
  return { past: [], present: initial, future: [] };
}

export function dispatchCommand(
  state: UndoState,
  cmd: PlayCommand,
): UndoState {
  const next = applyCommand(state.present, cmd);
  const past = [...state.past, state.present];
  const trimmed = past.length > MAX_UNDO ? past.slice(past.length - MAX_UNDO) : past;
  return {
    past: trimmed,
    present: next,
    future: [],
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
  };
}

export function redo(state: UndoState): UndoState {
  if (state.future.length === 0) return state;
  const [next, ...future] = state.future;
  return {
    past: [...state.past, state.present],
    present: next,
    future,
  };
}
