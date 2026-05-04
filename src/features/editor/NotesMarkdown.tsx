"use client";

import { Fragment, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Player } from "@/domain/play/types";
import { PlayerChip } from "./PlayerChip";

/**
 * Render play notes as formatted markdown — bold, italics, headings,
 * bullet lists, tables — instead of the raw `**` / `-` / `##` source
 * the value string contains. `@Label` tokens that match a known player
 * become inline colored chips (same widget the editor uses), so a coach
 * reading "X runs the slant" sees the red X circle instead of the bare
 * letter.
 *
 * Surfaced 2026-05-04: Cal-generated notes used markdown syntax that
 * showed up as raw asterisks/dashes in the play card. Reusing the chat
 * renderer's component overrides (AssistantMessage.tsx) keeps the visual
 * vocabulary identical across Cal's chat replies and the saved notes.
 *
 * The markdown source is stored verbatim — same string the editor
 * round-trips. This component is display-only; editing happens in
 * PlayerMentionEditor with raw markdown so coaches who know markdown
 * can write `**bold**` / `- bullet` directly. The toggle in
 * PlayNotesCard swaps between this rendered view and the editor.
 */
export function NotesMarkdown({
  value,
  players,
  className,
}: {
  value: string;
  players: Player[];
  className?: string;
}) {
  const playersByLabel = new Map<string, Player>();
  for (const p of players) {
    if (p.label) playersByLabel.set(p.label.toUpperCase(), p);
  }

  const replaceMentions = (node: React.ReactNode, keyPrefix = "atl"): React.ReactNode => {
    if (typeof node === "string") {
      if (!node.includes("@") || playersByLabel.size === 0) return node;
      const re = /@([A-Za-z][A-Za-z0-9]{0,3})\b/g;
      const parts: React.ReactNode[] = [];
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      let n = 0;
      while ((m = re.exec(node)) !== null) {
        const player = playersByLabel.get(m[1].toUpperCase());
        if (!player) continue;
        if (m.index > lastIdx) parts.push(node.slice(lastIdx, m.index));
        parts.push(
          <span
            key={`${keyPrefix}-${n}`}
            className="mx-0.5 inline-flex items-center align-baseline"
            aria-label={`Player ${player.label}`}
          >
            <PlayerChip player={player} size={16} />
          </span>,
        );
        lastIdx = m.index + m[0].length;
        n += 1;
      }
      if (parts.length === 0) return node;
      if (lastIdx < node.length) parts.push(node.slice(lastIdx));
      return <>{parts}</>;
    }
    if (Array.isArray(node)) {
      return node.map((child, i) => (
        <Fragment key={`${keyPrefix}-i${i}`}>
          {replaceMentions(child, `${keyPrefix}-i${i}`)}
        </Fragment>
      ));
    }
    if (isValidElement(node)) {
      const elem = node as React.ReactElement<{ children?: React.ReactNode }>;
      const props = elem.props as { children?: React.ReactNode };
      if (props && "children" in props) {
        return {
          ...elem,
          props: { ...props, children: replaceMentions(props.children, keyPrefix) },
        } as React.ReactElement;
      }
    }
    return node;
  };

  // Component overrides — same vocabulary as the chat renderer
  // (AssistantMessage.tsx) so coaches see consistent prose styling
  // across surfaces. Tightened spacing for the play-card / sidebar
  // density vs. chat's wider message column.
  const components: Components = {
    h1: ({ children }) => (
      <h1 className="mb-1.5 mt-2 text-base font-bold text-foreground first:mt-0">
        {replaceMentions(children)}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-1 mt-2 text-sm font-semibold text-foreground first:mt-0">
        {replaceMentions(children)}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-1 mt-1.5 text-sm font-semibold text-foreground/80 first:mt-0">
        {replaceMentions(children)}
      </h3>
    ),
    p: ({ children }) => (
      <p className="mb-1.5 leading-relaxed last:mb-0">{replaceMentions(children)}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed marker:text-muted [&>p]:mb-0">
        {replaceMentions(children)}
      </li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{replaceMentions(children)}</strong>
    ),
    em: ({ children }) => (
      <em className="italic text-foreground/80">{replaceMentions(children)}</em>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-1.5 border-l-2 border-primary/40 pl-3 text-foreground/70 italic">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-2 border-border" />,
    code: ({ children }) => (
      <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs text-foreground/90">
        {children}
      </code>
    ),
  };

  return (
    <div className={`text-sm text-foreground ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {value}
      </ReactMarkdown>
    </div>
  );
}
