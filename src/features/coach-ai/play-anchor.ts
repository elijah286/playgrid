"use client";

import { useSyncExternalStore } from "react";

// Mirrors playbook-anchor.ts but for the play the coach has open RIGHT NOW.
// Publishing this lets the Cal panel header show the play name so coaches
// can verify Cal's anchor matches their view — the playbookId is in the URL
// for /playbooks/<id> but a play's name isn't visible anywhere on /plays/.

export type PlayAnchor = {
  id: string;
  name: string | null;
};

let current: PlayAnchor | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function setPlayAnchor(next: PlayAnchor): void {
  if (current && current.id === next.id && current.name === next.name) return;
  current = next;
  emit();
}

export function clearPlayAnchor(forId: string): void {
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

function getSnapshot(): PlayAnchor | null {
  return current;
}

function getServerSnapshot(): PlayAnchor | null {
  return null;
}

export function usePlayAnchor(): PlayAnchor | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
