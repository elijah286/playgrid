"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Player, Route } from "@/domain/play/types";
import { playerChipHtml } from "./PlayerChip";

type Props = {
  value: string;
  onChange: (next: string) => void;
  players: Player[];
  routes?: Route[];
  placeholder?: string;
  className?: string;
};

const MENTION_ATTR = "data-mention";

const NAMED_COLORS: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: "red", rgb: [239, 68, 68] },
  { name: "orange", rgb: [242, 101, 34] },
  { name: "yellow", rgb: [250, 204, 21] },
  { name: "green", rgb: [34, 197, 94] },
  { name: "teal", rgb: [20, 184, 166] },
  { name: "cyan", rgb: [6, 182, 212] },
  { name: "blue", rgb: [59, 130, 246] },
  { name: "purple", rgb: [139, 92, 246] },
  { name: "pink", rgb: [236, 72, 153] },
  { name: "brown", rgb: [120, 53, 15] },
  { name: "white", rgb: [255, 255, 255] },
  { name: "black", rgb: [28, 28, 30] },
  { name: "gray", rgb: [148, 163, 184] },
];

function parseColor(c: string): [number, number, number] | null {
  if (!c) return null;
  const s = c.trim();
  const hex = s.startsWith("#") ? s.slice(1) : null;
  if (hex && (hex.length === 3 || hex.length === 6)) {
    const full =
      hex.length === 3
        ? hex.split("").map((ch) => ch + ch).join("")
        : hex;
    const n = parseInt(full, 16);
    if (Number.isFinite(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function nearestColorName(c: string): string | null {
  const rgb = parseColor(c);
  if (!rgb) return null;
  let best = NAMED_COLORS[0];
  let bestDist = Infinity;
  for (const nc of NAMED_COLORS) {
    const dr = rgb[0] - nc.rgb[0];
    const dg = rgb[1] - nc.rgb[1];
    const db = rgb[2] - nc.rgb[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = nc;
    }
  }
  return best.name;
}

function buildPlayerColorMap(
  players: Player[],
  routes: Route[] | undefined,
): Map<string, Player[]> {
  const routeStrokeByCarrier = new Map<string, string>();
  for (const r of routes ?? []) {
    if (!routeStrokeByCarrier.has(r.carrierPlayerId)) {
      routeStrokeByCarrier.set(r.carrierPlayerId, r.style.stroke);
    }
  }
  const byColor = new Map<string, Player[]>();
  const seen = new Map<string, Set<string>>();
  const add = (name: string | null, p: Player) => {
    if (!name) return;
    if (!seen.has(name)) seen.set(name, new Set());
    const s = seen.get(name)!;
    if (s.has(p.id)) return;
    s.add(p.id);
    if (!byColor.has(name)) byColor.set(name, []);
    byColor.get(name)!.push(p);
  };
  for (const p of players) {
    add(nearestColorName(p.style.fill), p);
    const stroke = routeStrokeByCarrier.get(p.id);
    if (stroke) add(nearestColorName(stroke), p);
  }
  return byColor;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderValueToHtml(
  value: string,
  players: Player[],
  routes?: Route[],
): string {
  if (!value) return "";
  const byLabel = new Map<string, Player>();
  for (const p of players) if (p.label && !byLabel.has(p.label)) byLabel.set(p.label, p);
  const byColor = buildPlayerColorMap(players, routes);

  const out: string[] = [];
  const re = /@([A-Za-z0-9]{1,10})/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const token = m[1];
    let player = byLabel.get(token);
    if (!player) {
      const matches = byColor.get(token.toLowerCase());
      if (matches && matches.length > 0) player = matches[0];
    }
    if (!player) continue;
    if (m.index > lastIdx) out.push(escapeHtml(value.slice(lastIdx, m.index)));
    out.push(
      `<span ${MENTION_ATTR}="${escapeHtml(token)}" contenteditable="false" class="pme-chip" style="display:inline-block;margin:0 1px;line-height:1;vertical-align:middle;">${playerChipHtml(player, 16)}</span>`,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < value.length) out.push(escapeHtml(value.slice(lastIdx)));
  return out.join("").replace(/\n/g, "<br>");
}

function serializeDom(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      parts.push("\n");
      return;
    }
    const mention = el.getAttribute?.(MENTION_ATTR);
    if (mention != null) {
      parts.push(`@${mention}`);
      return;
    }
    if (el.tagName === "DIV" || el.tagName === "P") {
      if (parts.length > 0 && !parts[parts.length - 1]?.endsWith("\n")) parts.push("\n");
      el.childNodes.forEach(walk);
      return;
    }
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return parts.join("");
}

type CaretInfo = { node: Node; offset: number } | null;

function getCaret(root: HTMLElement): CaretInfo {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  return { node: r.startContainer, offset: r.startOffset };
}

/**
 * Walk the editor DOM and convert a (container, offset) DOM position into
 * a char index in the serialized value. Used by both the single-caret
 * helper below and the selection-range helper that powers the format
 * toolbar's wrap / line-prefix operations.
 */
function charIndexFromPoint(root: HTMLElement, target: { node: Node; offset: number }): number {
  let count = 0;
  let done = false;
  const walk = (node: Node): void => {
    if (done) return;
    if (node === target.node && node.nodeType === Node.TEXT_NODE) {
      count += target.offset;
      done = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += (node.nodeValue ?? "").length;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el === target.node) {
        for (let i = 0; i < target.offset; i++) {
          const c = el.childNodes[i];
          if (c) walk(c);
        }
        done = true;
        return;
      }
      if (el.tagName === "BR") {
        count += 1;
        return;
      }
      const mention = el.getAttribute?.(MENTION_ATTR);
      if (mention != null) {
        count += mention.length + 1; // "@" + label
        return;
      }
      el.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  return count;
}

function getCaretCharIndex(root: HTMLElement): number | null {
  const caret = getCaret(root);
  if (!caret) return null;
  return charIndexFromPoint(root, caret);
}

/**
 * Return the current selection's start + end as char offsets in the
 * serialized value, or null if the selection isn't inside `root`.
 * For a collapsed caret (no selected text), start === end.
 */
function getSelectionCharRange(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const a = charIndexFromPoint(root, { node: r.startContainer, offset: r.startOffset });
  const b = charIndexFromPoint(root, { node: r.endContainer, offset: r.endOffset });
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/**
 * Resolve a char index in the serialized value to a (node, offset) DOM
 * position inside `root`. Used by both the single-caret setter and the
 * range setter that powers post-format selection restoration.
 */
function pointFromCharIndex(
  root: HTMLElement,
  target: number,
): { node: Node; offset: number } {
  let remaining = target;
  let resultNode: Node | null = null;
  let resultOffset = 0;
  const walk = (node: Node): boolean => {
    if (resultNode) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue ?? "").length;
      if (remaining <= len) {
        resultNode = node;
        resultOffset = remaining;
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        if (remaining <= 0) {
          const parent = el.parentNode;
          if (parent) {
            resultNode = parent;
            resultOffset = Array.prototype.indexOf.call(parent.childNodes, el);
          }
          return true;
        }
        remaining -= 1;
        return false;
      }
      const mention = el.getAttribute?.(MENTION_ATTR);
      if (mention != null) {
        const len = mention.length + 1;
        if (remaining <= 0) {
          const parent = el.parentNode;
          if (parent) {
            resultNode = parent;
            resultOffset = Array.prototype.indexOf.call(parent.childNodes, el);
          }
          return true;
        }
        if (remaining <= len) {
          const parent = el.parentNode;
          if (parent) {
            resultNode = parent;
            resultOffset = Array.prototype.indexOf.call(parent.childNodes, el) + 1;
          }
          return true;
        }
        remaining -= len;
        return false;
      }
      for (let i = 0; i < el.childNodes.length; i++) {
        if (walk(el.childNodes[i])) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < root.childNodes.length; i++) {
    if (walk(root.childNodes[i])) break;
  }
  if (!resultNode) {
    return { node: root, offset: root.childNodes.length };
  }
  return { node: resultNode, offset: resultOffset };
}

function setSelectionCharRange(root: HTMLElement, start: number, end: number) {
  const a = pointFromCharIndex(root, start);
  const b = start === end ? a : pointFromCharIndex(root, end);
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  try {
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    /* noop */
  }
}

function setCaretCharIndex(root: HTMLElement, target: number) {
  let remaining = target;
  let resultNode: Node | null = null;
  let resultOffset = 0;
  const walk = (node: Node): boolean => {
    if (resultNode) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue ?? "").length;
      if (remaining <= len) {
        resultNode = node;
        resultOffset = remaining;
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        if (remaining <= 0) {
          const parent = el.parentNode;
          if (parent) {
            resultNode = parent;
            resultOffset = Array.prototype.indexOf.call(parent.childNodes, el);
          }
          return true;
        }
        remaining -= 1;
        return false;
      }
      const mention = el.getAttribute?.(MENTION_ATTR);
      if (mention != null) {
        const len = mention.length + 1;
        if (remaining <= 0) {
          const parent = el.parentNode;
          if (parent) {
            resultNode = parent;
            resultOffset = Array.prototype.indexOf.call(parent.childNodes, el);
          }
          return true;
        }
        if (remaining <= len) {
          const parent = el.parentNode;
          if (parent) {
            resultNode = parent;
            resultOffset = Array.prototype.indexOf.call(parent.childNodes, el) + 1;
          }
          return true;
        }
        remaining -= len;
        return false;
      }
      for (let i = 0; i < el.childNodes.length; i++) {
        if (walk(el.childNodes[i])) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < root.childNodes.length; i++) {
    if (walk(root.childNodes[i])) break;
  }
  if (!resultNode) {
    resultNode = root;
    resultOffset = root.childNodes.length;
  }
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  try {
    r.setStart(resultNode!, resultOffset);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    /* noop */
  }
}

/**
 * Apply markdown formatting to the value at the given selection range.
 * Wrap mode (bold/italic): wraps the selected slice in `wrapper`. If the
 * selection is collapsed, inserts a placeholder ("text" / "italic") so
 * the user has something to overwrite. Returns the new value plus the
 * caret/selection range to restore after the editor re-renders.
 *
 * Toggle behavior: if the selection is ALREADY wrapped in the same
 * markers, strip them instead of double-wrapping. Lets the same button
 * un-bold, un-italicize.
 */
export function applyWrap(
  value: string,
  range: { start: number; end: number },
  wrapper: string,
  placeholder: string,
): { newValue: string; selStart: number; selEnd: number } {
  const { start, end } = range;
  const w = wrapper.length;
  // Toggle: selection is exactly the inside of an existing wrap.
  if (
    start >= w &&
    end + w <= value.length &&
    value.slice(start - w, start) === wrapper &&
    value.slice(end, end + w) === wrapper
  ) {
    const newValue = value.slice(0, start - w) + value.slice(start, end) + value.slice(end + w);
    return { newValue, selStart: start - w, selEnd: end - w };
  }
  // Toggle: selection itself is "WrapperTextWrapper" (double-clicked
  // the bold word picked up the markers too).
  if (
    end - start >= w * 2 &&
    value.slice(start, start + w) === wrapper &&
    value.slice(end - w, end) === wrapper
  ) {
    const inner = value.slice(start + w, end - w);
    const newValue = value.slice(0, start) + inner + value.slice(end);
    return { newValue, selStart: start, selEnd: start + inner.length };
  }
  const selected = value.slice(start, end);
  const text = selected || placeholder;
  const newValue = value.slice(0, start) + wrapper + text + wrapper + value.slice(end);
  return {
    newValue,
    selStart: start + w,
    selEnd: start + w + text.length,
  };
}

/**
 * Prefix each line that the selection touches with `prefix` (e.g. "- "
 * for bullets, "## " for headings). Idempotent toggle — a second tap on
 * the same lines strips the prefix back off.
 */
export function applyLinePrefix(
  value: string,
  range: { start: number; end: number },
  prefix: string,
): { newValue: string; selStart: number; selEnd: number } {
  const { start, end } = range;
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const nextNl = value.indexOf("\n", end);
  const lineEnd = nextNl === -1 ? value.length : nextNl;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  // Toggle: every non-empty line already has the prefix → strip it.
  // Empty lines are skipped on both add and strip — keeps tight spacing
  // in bulleted blocks ("a\n\nb" should bullet to "- a\n\n- b", NOT
  // "- a\n- \n- b").
  const allHavePrefix = lines.every((l) => l.length === 0 || l.startsWith(prefix));
  const transformed = allHavePrefix
    ? lines.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l)).join("\n")
    : lines.map((l) => (l.length === 0 || l.startsWith(prefix) ? l : prefix + l)).join("\n");
  const newValue = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
  // Caret/selection: keep it covering the same logical text, accounting
  // for the prefix delta on each line.
  const delta = transformed.length - block.length;
  return {
    newValue,
    selStart: start + (allHavePrefix ? -prefix.length : prefix.length),
    selEnd: end + delta,
  };
}

/** Single button in the format toolbar. Tap-friendly height so it sits
 *  comfortably above the on-screen keyboard on mobile. */
function FormatBtn({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className="inline-flex h-8 min-w-[32px] items-center justify-center rounded px-2 text-xs text-foreground transition-colors hover:bg-surface-inset active:bg-surface-inset"
    >
      {children}
    </button>
  );
}

export function PlayerMentionEditor({
  value,
  onChange,
  players,
  routes,
  placeholder,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastSerializedRef = useRef<string>(value);
  const lastPlayersSigRef = useRef<string>("");
  const skipSyncRef = useRef(false);
  /** Selection range to restore on the next sync. Set by format buttons
   *  before calling onChange so the cursor lands inside the new wrap
   *  (or selects what the user just bolded). Consumed once, then cleared. */
  const pendingSelRef = useRef<{ start: number; end: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [localEmpty, setLocalEmpty] = useState(!value);
  const isEmpty = !value && localEmpty;

  const playersSig = useMemo(
    () =>
      players
        .map((p) => `${p.id}:${p.label}:${p.style.fill}:${p.style.stroke}:${p.style.labelColor}`)
        .join("|") +
      "||" +
      (routes ?? []).map((r) => `${r.id}:${r.carrierPlayerId}:${r.style.stroke}`).join("|"),
    [players, routes],
  );

  const colorIndex = useMemo(
    () => buildPlayerColorMap(players, routes),
    [players, routes],
  );

  // Sync DOM from value when external value or players change.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sameValue = value === lastSerializedRef.current;
    const samePlayers = playersSig === lastPlayersSigRef.current;
    if (skipSyncRef.current && sameValue && samePlayers) {
      skipSyncRef.current = false;
      return;
    }
    const caret = getCaretCharIndex(el);
    el.innerHTML = renderValueToHtml(value, players, routes);
    lastSerializedRef.current = value;
    lastPlayersSigRef.current = playersSig;
    // A pending selection from a format button takes precedence over the
    // pre-render caret position so the cursor lands inside the new wrap
    // (or re-selects the just-bolded text).
    const pending = pendingSelRef.current;
    pendingSelRef.current = null;
    if (pending) {
      el.focus();
      setSelectionCharRange(el, pending.start, pending.end);
    } else if (caret != null && document.activeElement === el) {
      setCaretCharIndex(el, Math.min(caret, value.length));
    }
  }, [value, playersSig, players, routes]);

  const [mention, setMention] = useState<{
    query: string;
    anchor: { left: number; top: number };
  } | null>(null);

  const updateMentionState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      setMention(null);
      return;
    }
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      setMention(null);
      return;
    }
    const text = node.nodeValue ?? "";
    const before = text.slice(0, offset);
    const match = /@([A-Za-z0-9]{0,10})$/.exec(before);
    if (!match) {
      setMention(null);
      return;
    }
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset);
    const rect = range.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setMention({
      query: match[1],
      anchor: { left: rect.left - elRect.left, top: rect.bottom - elRect.top + 4 },
    });
  }, []);

  const handleInput = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = serializeDom(el);
    setLocalEmpty(!next);
    if (next !== lastSerializedRef.current) {
      skipSyncRef.current = true;
      lastSerializedRef.current = next;
      onChange(next);
    }
    updateMentionState();
  }, [onChange, updateMentionState]);

  const insertMention = useCallback(
    (player: Player) => {
      const el = ref.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      const node = r.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;
      const text = node.nodeValue ?? "";
      const before = text.slice(0, r.startOffset);
      const after = text.slice(r.startOffset);
      const at = before.lastIndexOf("@");
      if (at < 0) return;
      // Replace "@<query>" with chip + trailing space
      (node as Text).nodeValue = text.slice(0, at) + after;
      const newOffsetInNode = at;
      r.setStart(node, newOffsetInNode);
      r.setEnd(node, newOffsetInNode);

      // Build chip span
      const wrapper = document.createElement("span");
      wrapper.innerHTML = `<span ${MENTION_ATTR}="${player.label}" contenteditable="false" class="pme-chip" style="display:inline-block;margin:0 1px;line-height:1;vertical-align:middle;">${playerChipHtml(player, 16)}</span>`;
      const chip = wrapper.firstElementChild as HTMLElement;
      const spaceNode = document.createTextNode("\u00A0");
      r.insertNode(spaceNode);
      r.insertNode(chip);
      // Move caret after space
      const newRange = document.createRange();
      newRange.setStartAfter(spaceNode);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      setMention(null);
      handleInput();
    },
    [handleInput],
  );

  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const seen = new Set<string>();
    const out: Player[] = [];
    const push = (p: Player) => {
      if (!p.label || seen.has(p.id)) return;
      seen.add(p.id);
      out.push(p);
    };
    for (const p of players) {
      if (q === "" || p.label.toLowerCase().startsWith(q)) push(p);
    }
    if (q !== "") {
      for (const [colorName, ps] of colorIndex) {
        if (colorName.startsWith(q)) {
          for (const p of ps) push(p);
        }
      }
    }
    return out.slice(0, 8);
  }, [mention, players, colorIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (mention && candidates.length > 0) {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(candidates[0]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMention(null);
          return;
        }
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const r = sel.getRangeAt(0);
        if (!r.collapsed) return;
        const el = ref.current;
        if (!el) return;
        const container = r.startContainer;
        const offset = r.startOffset;
        let adjacent: Node | null = null;
        if (e.key === "Backspace") {
          if (container.nodeType === Node.TEXT_NODE) {
            if (offset === 0) adjacent = (container as Text).previousSibling;
          } else {
            adjacent = container.childNodes[offset - 1] ?? null;
          }
        } else {
          if (container.nodeType === Node.TEXT_NODE) {
            const len = (container.nodeValue ?? "").length;
            if (offset === len) adjacent = (container as Text).nextSibling;
          } else {
            adjacent = container.childNodes[offset] ?? null;
          }
        }
        if (
          adjacent &&
          adjacent.nodeType === Node.ELEMENT_NODE &&
          (adjacent as HTMLElement).getAttribute?.(MENTION_ATTR) != null
        ) {
          e.preventDefault();
          (adjacent as HTMLElement).remove();
          handleInput();
        }
      }
    },
    [mention, candidates, insertMention, handleInput],
  );

  const applyFormat = useCallback(
    (kind: "bold" | "italic" | "bullet" | "heading") => {
      const el = ref.current;
      if (!el) return;
      const range = getSelectionCharRange(el) ?? { start: value.length, end: value.length };
      let result;
      if (kind === "bold") {
        result = applyWrap(value, range, "**", "text");
      } else if (kind === "italic") {
        result = applyWrap(value, range, "*", "italic");
      } else if (kind === "bullet") {
        result = applyLinePrefix(value, range, "- ");
      } else {
        result = applyLinePrefix(value, range, "## ");
      }
      pendingSelRef.current = { start: result.selStart, end: result.selEnd };
      lastSerializedRef.current = result.newValue;
      onChange(result.newValue);
    },
    [value, onChange],
  );

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Format toolbar — appears above the field when focused so coaches
          can bold / bullet / heading without typing markdown. Hidden when
          the field is idle so it's not visual clutter while reading. The
          buttons use onMouseDown preventDefault to keep focus inside the
          contentEditable so the selection survives the click. */}
      {focused && (
        <div
          className="mb-1 flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1 py-1 shadow-sm"
          onMouseDown={(e) => e.preventDefault()}
        >
          <FormatBtn label="Bold" title="Bold (**)" onClick={() => applyFormat("bold")}>
            <span className="font-bold">B</span>
          </FormatBtn>
          <FormatBtn label="Italic" title="Italic (*)" onClick={() => applyFormat("italic")}>
            <span className="italic">I</span>
          </FormatBtn>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <FormatBtn label="Bullet list" title="Bullet list (- )" onClick={() => applyFormat("bullet")}>
            <span aria-hidden>• List</span>
          </FormatBtn>
          <FormatBtn label="Heading" title="Heading (## )" onClick={() => applyFormat("heading")}>
            <span aria-hidden className="font-semibold">H</span>
          </FormatBtn>
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={updateMentionState}
        onMouseUp={updateMentionState}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Defer so a tap on a toolbar button (which preventDefaults
          // its own mousedown) doesn't visibly flicker the toolbar
          // while the focus briefly leaves the editor.
          setTimeout(() => {
            const el = ref.current;
            if (!el) return;
            if (document.activeElement !== el) setFocused(false);
            setMention(null);
          }, 120);
        }}
        className="min-h-[120px] w-full whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
      />
      {isEmpty && placeholder && (
        <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted">
          {placeholder}
        </div>
      )}
      {mention && candidates.length > 0 && (
        <ul
          className="absolute z-20 min-w-[140px] overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg"
          style={{ left: mention.anchor.left, top: mention.anchor.top }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {candidates.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => insertMention(p)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${i === 0 ? "bg-surface-inset" : ""} hover:bg-surface-inset`}
              >
                <span
                  dangerouslySetInnerHTML={{ __html: playerChipHtml(p, 14) }}
                  style={{ display: "inline-flex" }}
                />
                <span className="font-semibold">{p.label}</span>
                <span className="text-muted">{p.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
