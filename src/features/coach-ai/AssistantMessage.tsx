"use client";

import { Children, isValidElement, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ChevronDown } from "lucide-react";
import { PlayDiagramEmbed, PlayDiagramRef } from "./PlayDiagramEmbed";

/**
 * Coach Cal answers follow a TL;DR-first convention (see agent prompt rule
 * 5): when the response is long, Cal opens with a 1-2 sentence direct
 * answer, then a `## Details` heading and the structured breakdown.
 *
 * We split the rendered message at the FIRST `## Details` heading so the
 * preamble (the TL;DR + any diagram + adjacent prose) is always visible,
 * and the deep breakdown can be tapped open by coaches who want it.
 * Coaches who just need the quick answer never have to scroll past it.
 *
 * Header text is matched case-insensitive on the literal string "Details"
 * so a slightly different phrasing from the model ("## Details" vs "## DETAILS")
 * still triggers the split. We only split on the FIRST occurrence to keep
 * nested H2s in long answers from fragmenting the layout.
 */
function splitDetails(text: string): { preamble: string; details: string | null } {
  const re = /^##\s+details\s*$/im;
  const m = re.exec(text);
  if (!m) return { preamble: text, details: null };
  const idx = m.index;
  // Strip the heading line itself from the details body (it becomes the
  // disclosure summary) but preserve everything below it verbatim.
  const after = text.slice(idx).replace(re, "").trimStart();
  return { preamble: text.slice(0, idx).trimEnd(), details: after };
}

function DetailsDisclosure({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-inset/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted hover:bg-surface-inset"
      >
        <span>{open ? "Hide details" : "Show details"}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-sm text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {markdown}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function isInternalHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return false;
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
    if (lang === "play-ref") return <PlayDiagramRef json={raw} />;
    if (lang === "diagram") return <FootballDiagram text={raw} />;

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
  const { preamble, details } = splitDetails(text);
  return (
    <div className="text-sm text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {preamble}
      </ReactMarkdown>
      {details && <DetailsDisclosure markdown={details} />}
    </div>
  );
}
