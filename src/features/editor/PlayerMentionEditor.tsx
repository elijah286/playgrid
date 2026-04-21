"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Player } from "@/domain/play/types";
import { playerChipHtml } from "./PlayerChip";

type Props = {
  value: string;
  onChange: (next: string) => void;
  players: Player[];
  placeholder?: string;
  className?: string;
};

const MENTION_ATTR = "data-mention";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderValueToHtml(value: string, players: Player[]): string {
  if (!value) return "";
  const byLabel = new Map<string, Player>();
  for (const p of players) if (p.label && !byLabel.has(p.label)) byLabel.set(p.label, p);

  const out: string[] = [];
  const re = /@([A-Za-z0-9]{1,4})/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const label = m[1];
    const player = byLabel.get(label);
    if (!player) continue;
    if (m.index > lastIdx) out.push(escapeHtml(value.slice(lastIdx, m.index)));
    out.push(
      `<span ${MENTION_ATTR}="${escapeHtml(label)}" contenteditable="false" class="pme-chip" style="display:inline-flex;align-items:center;gap:2px;padding:0 4px 0 2px;margin:0 1px;border-radius:9999px;background:var(--surface-inset,rgba(0,0,0,0.06));line-height:1;">${playerChipHtml(player, 14)}<span style="font-size:11px;font-weight:600;">${escapeHtml(label)}</span></span>`,
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

function getCaretCharIndex(root: HTMLElement): number | null {
  const caret = getCaret(root);
  if (!caret) return null;
  let count = 0;
  let done = false;
  const walk = (node: Node): void => {
    if (done) return;
    if (node === caret.node && node.nodeType === Node.TEXT_NODE) {
      count += caret.offset;
      done = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += (node.nodeValue ?? "").length;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el === caret.node) {
        // caret is at child index caret.offset within this element
        for (let i = 0; i < caret.offset; i++) {
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
  return done ? count : count;
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

export function PlayerMentionEditor({
  value,
  onChange,
  players,
  placeholder,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastSerializedRef = useRef<string>(value);
  const lastPlayersSigRef = useRef<string>("");
  const skipSyncRef = useRef(false);
  const [localEmpty, setLocalEmpty] = useState(!value);
  const isEmpty = !value && localEmpty;

  const playersSig = useMemo(
    () => players.map((p) => `${p.id}:${p.label}:${p.style.fill}:${p.style.stroke}:${p.style.labelColor}`).join("|"),
    [players],
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
    el.innerHTML = renderValueToHtml(value, players);
    lastSerializedRef.current = value;
    lastPlayersSigRef.current = playersSig;
    if (caret != null && document.activeElement === el) {
      setCaretCharIndex(el, Math.min(caret, value.length));
    }
  }, [value, playersSig, players]);

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
    const match = /@([A-Za-z0-9]{0,4})$/.exec(before);
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
      wrapper.innerHTML = `<span ${MENTION_ATTR}="${player.label}" contenteditable="false" class="pme-chip" style="display:inline-flex;align-items:center;gap:2px;padding:0 4px 0 2px;margin:0 1px;border-radius:9999px;background:var(--surface-inset,rgba(0,0,0,0.06));line-height:1;">${playerChipHtml(player, 14)}<span style="font-size:11px;font-weight:600;">${player.label}</span></span>`;
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
    return players
      .filter((p) => p.label && (q === "" || p.label.toLowerCase().startsWith(q)))
      .slice(0, 8);
  }, [mention, players]);

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

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        ref={ref}
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={updateMentionState}
        onMouseUp={updateMentionState}
        onBlur={() => setTimeout(() => setMention(null), 120)}
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
