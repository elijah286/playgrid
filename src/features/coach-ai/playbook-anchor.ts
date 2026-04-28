"use client";

import { useSyncExternalStore } from "react";

// Tiny pub-sub store that lets a page publish "I'm currently inside this
// playbook's scope" so the global Coach AI launcher (mounted in the site
// header, above page layout) can keep its anchor stable while the user
// navigates within a single playbook — including into the play editor at
// /plays/<playId>, whose URL doesn't match the /playbooks/<id> pattern the
// launcher would otherwise rely on.

export type PlaybookAnchor = {
  id: string;
  name: string | null;
  color: string | null;
};

let current: PlaybookAnchor | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function setPlaybookAnchor(next: PlaybookAnchor): void {
  if (
    current &&
    current.id === next.id &&
    current.name === next.name &&
    current.color === next.color
  ) {
    return;
  }
  current = next;
  emit();
}

export function clearPlaybookAnchor(forId: string): void {
  // Only clear if we still hold this id — otherwise a fast remount on
  // navigation can race and wipe an anchor a sibling just published.
  if (current && current.id === forId) {
    current = null;
    emit();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): PlaybookAnchor | null {
  return current;
}

function getServerSnapshot(): PlaybookAnchor | null {
  return null;
}

export function usePlaybookAnchor(): PlaybookAnchor | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
