"use client";

import { useCallback, useMemo, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import {
  createUndoState,
  dispatchCommand,
  redo,
  undo,
  type UndoState,
} from "@/domain/play/undo";

export function usePlayEditor(initial: PlayDocument) {
  const [state, setState] = useState<UndoState>(() => createUndoState(initial));

  const doc = state.present;

  const dispatch = useCallback((cmd: PlayCommand) => {
    setState((s) => dispatchCommand(s, cmd));
  }, []);

  const undoLast = useCallback(() => {
    setState((s) => undo(s));
  }, []);

  const redoLast = useCallback(() => {
    setState((s) => redo(s));
  }, []);

  const replaceDocument = useCallback((next: PlayDocument) => {
    setState(createUndoState(next));
  }, []);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  return useMemo(
    () => ({
      doc,
      dispatch,
      undo: undoLast,
      redo: redoLast,
      replaceDocument,
      canUndo,
      canRedo,
    }),
    [doc, dispatch, undoLast, redoLast, replaceDocument, canUndo, canRedo],
  );
}
