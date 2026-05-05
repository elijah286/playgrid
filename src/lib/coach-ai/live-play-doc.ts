import type { PlayDocument } from "@/domain/play/types";

// Lets Cal see the EXACT in-memory state of the play the coach is editing,
// even before autosave persists it to play_versions.document. Without this,
// edits made during the autosave debounce (or while the editor's selection-
// active 30s safety net is pending) are invisible to Cal — coaches saw Cal
// reference pre-rename labels and pre-recolor fills as if those edits hadn't
// happened. The store is a window-level map so the chat (mounted in the
// global launcher) and the editor (mounted under the play route) can share
// state without lifting it through React context.

declare global {
  interface Window {
    __coachCalLivePlayDocs?: Record<string, PlayDocument>;
  }
}

export function publishLivePlayDoc(playId: string, doc: PlayDocument): void {
  if (typeof window === "undefined") return;
  const store = (window.__coachCalLivePlayDocs ??= {});
  store[playId] = doc;
}

export function clearLivePlayDoc(playId: string): void {
  if (typeof window === "undefined") return;
  const store = window.__coachCalLivePlayDocs;
  if (!store) return;
  delete store[playId];
}

export function readLivePlayDoc(playId: string): PlayDocument | null {
  if (typeof window === "undefined") return null;
  return window.__coachCalLivePlayDocs?.[playId] ?? null;
}
