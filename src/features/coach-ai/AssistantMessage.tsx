"use client";

import { Children, isValidElement } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { PlayDiagramEmbed } from "./PlayDiagramEmbed";

function isInternalHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return false;
}

type PlaybookChip = {
  id: string;
  name: string;
  color?: string | null;
  season?: string | null;
  variant?: string | null;
};

function PlaybookButtonList({ json }: { json: string }) {
  let items: PlaybookChip[] = [];
  try { items = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="my-2 flex flex-col gap-1.5">
      {items.map((pb) => {
        const bg = pb.color ?? "#134e2a";
        const label = [pb.name, pb.season].filter(Boolean).join(" · ");
        return (
          <Link
            key={pb.id}
            href={`/playbooks/${pb.id}?cal_from=1&cal_team=${encodeURIComponent(pb.name)}`}
            style={{ backgroundColor: bg }}
            className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function FootballDiagram({ text }: { text: string }) {
  const lines = text.trimEnd().split("\n");
  const minIndent = lines
    .filter((l) => l.trim().length > 0)
    .reduce((min, l) => Math.min(min, l.match(/^(\s*)/)?.[1].length ?? 0), Infinity);
  const stripped = lines.map((l) => l.slice(minIndent === Infinity ? 0 : minIndent));

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-emerald-800/40 bg-emerald-950/60 px-4 py-3 shadow-inner">
      <pre
        className="font-mono text-[13px] leading-5 tracking-wide text-emerald-200 whitespace-pre"
        aria-label="Football formation diagram"
      >
        {stripped.join("\n")}
      </pre>
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-bold text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold text-foreground/80 first:mt-0">{children}</h3>
  ),

  p: ({ children }) => (
    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
  ),

  ul: ({ children }) => (
    <ul className="mb-2 space-y-0.5 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed marker:text-muted [&>p]:mb-0">{children}</li>
  ),

  // Block code — react-markdown renders <pre><code className="language-xxx">.
  // We override `code` below, so the child's `type` is our custom function,
  // not the string "code" — find by props.className instead.
  pre: ({ children }) => {
    const child = Children.toArray(children).find(
      (c) =>
        isValidElement(c) &&
        typeof (c as React.ReactElement<{ className?: string }>).props?.className === "string",
    ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;

    const className = child?.props?.className ?? "";
    const lang = /language-(\w+)/.exec(className)?.[1] ?? "";
    const raw = String(child?.props?.children ?? "").replace(/\n$/, "");

    if (lang === "play") return <PlayDiagramEmbed json={raw} />;
    if (lang === "diagram") return <FootballDiagram text={raw} />;
    if (lang === "playbooks") return <PlaybookButtonList json={raw} />;

    // Suppress empty code fences — they render as a thin grey pill artifact,
    // usually from the model truncating mid-diagram or emitting ``` ``` alone.
    if (!raw.trim()) return null;

    return (
      <pre className="my-2 overflow-x-auto rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-foreground/90">
        <code className={className}>{raw}</code>
      </pre>
    );
  },

  // Inline code only (block handled by pre above)
  code: ({ className, children }) => {
    if (className?.startsWith("language-")) return null;
    return (
      <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-xs text-foreground/90">
        {children}
      </code>
    );
  },

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-sm italic text-foreground/70">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-3 border-border" />,

  // Use next/link for in-app paths so navigating doesn't full-page reload
  // (which would unmount the chat). External links keep default behavior.
  a: ({ href, children }) => {
    const url = typeof href === "string" ? href : "";
    if (isInternalHref(url)) {
      return (
        <Link href={url} className="text-primary underline-offset-2 hover:underline">
          {children}
        </Link>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 hover:underline"
      >
        {children}
      </a>
    );
  },

  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,

  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-inset">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-semibold text-foreground/80">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-border px-3 py-1.5 text-foreground/70">{children}</td>
  ),
};

export function AssistantMessage({ text }: { text: string }) {
  return (
    <div className="text-sm text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
