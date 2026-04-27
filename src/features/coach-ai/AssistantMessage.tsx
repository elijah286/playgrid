"use client";

import { Children, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

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

  // Block code — react-markdown renders <pre><code className="language-xxx">
  pre: ({ children }) => {
    // Find the inner <code> element
    const child = Children.toArray(children).find(
      (c) => isValidElement(c) && (c as React.ReactElement<{ className?: string }>).type === "code",
    ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;

    const className = child?.props?.className ?? "";
    const lang = /language-(\w+)/.exec(className)?.[1] ?? "";
    const raw = String(child?.props?.children ?? "").replace(/\n$/, "");

    if (lang === "diagram") return <FootballDiagram text={raw} />;

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
