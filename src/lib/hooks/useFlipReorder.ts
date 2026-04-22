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
export function useFlipReorder(
  keys: readonly string[],
  { durationMs = 320 }: { durationMs?: number } = {},
): (key: string, node: HTMLElement | null) => void {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const prevRectsRef = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const nodes = nodesRef.current;
    const prevRects = prevRectsRef.current;
    const nextRects = new Map<string, DOMRect>();

    keys.forEach((key) => {
      const node = nodes.get(key);
      if (node) nextRects.set(key, node.getBoundingClientRect());
    });

    nextRects.forEach((next, key) => {
      const prev = prevRects.get(key);
      const node = nodes.get(key);
      if (!prev || !node) return;
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.transition = "transform 0s";
      // Force reflow so the browser registers the pre-transform before we animate.
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

  return (key, node) => {
    if (node) nodesRef.current.set(key, node);
    else nodesRef.current.delete(key);
  };
}
