"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * FLIP animation helper for a keyed, reorderable list of DOM nodes.
 *
 * Usage:
 *   const registerNode = useFlipReorder(items.map((i) => i.id));
 *   items.map((i) => (
 *     <div ref={(el) => registerNode(i.id, el)} key={i.id}>…</div>
 *   ))
 *
 * On every render, we measure each registered node, compare to its
 * previous position, and play a short "first, last, invert, play"
 * transition so reorders read as motion instead of instant jumps.
 *
 * Nodes must opt in with `transition-none` unset in their base classes
 * — the hook sets `transition: transform` inline while playing.
 */
export type FlipReorder = {
  register: (key: string, node: HTMLElement | null) => void;
  /**
   * Re-anchor: measure current rects as "prev" and clear any running
   * transitions. Use after native drag/drop so the browser's post-drop
   * layout reset doesn't cause an unwanted slide-back animation.
   */
  snap: () => void;
};

export function useFlipReorder(
  keys: readonly string[],
  { durationMs = 320 }: { durationMs?: number } = {},
): FlipReorder {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const prevRectsRef = useRef(new Map<string, DOMRect>());
  const suppressNextRef = useRef(false);

  useLayoutEffect(() => {
    const nodes = nodesRef.current;
    const prevRects = prevRectsRef.current;
    const nextRects = new Map<string, DOMRect>();

    keys.forEach((key) => {
      const node = nodes.get(key);
      if (node) nextRects.set(key, node.getBoundingClientRect());
    });

    if (suppressNextRef.current) {
      suppressNextRef.current = false;
      prevRectsRef.current = nextRects;
      return;
    }

    nextRects.forEach((next, key) => {
      const prev = prevRects.get(key);
      const node = nodes.get(key);
      if (!prev || !node) return;
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.transition = "transform 0s";
      void node.getBoundingClientRect();
      node.style.transform = "";
      node.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      const clear = () => {
        node.style.transition = "";
        node.removeEventListener("transitionend", clear);
      };
      node.addEventListener("transitionend", clear);
    });

    prevRectsRef.current = nextRects;
  });

  const register = (key: string, node: HTMLElement | null) => {
    if (node) nodesRef.current.set(key, node);
    else nodesRef.current.delete(key);
  };

  const snap = () => {
    const nodes = nodesRef.current;
    const rects = new Map<string, DOMRect>();
    nodes.forEach((node, key) => {
      node.style.transition = "";
      node.style.transform = "";
      rects.set(key, node.getBoundingClientRect());
    });
    prevRectsRef.current = rects;
    // Also skip the very next layout-effect so the post-drop re-render
    // (triggered by setDraggingPlayId(null), commitPlayOrder, etc.)
    // doesn't run a stale diff against the browser's transient reset.
    suppressNextRef.current = true;
  };

  return { register, snap };
}
