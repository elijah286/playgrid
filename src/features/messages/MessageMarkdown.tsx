"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * Render a chat message body. Markdown subset:
 *
 *   ✅ bold, italic, strikethrough  ✅ links (auto-detected via remark-gfm)
 *   ✅ inline code, code blocks      ✅ ordered + unordered lists
 *   ✅ blockquote                    ✅ horizontal rules
 *
 * Disallowed: raw HTML (react-markdown's default — no rehype-raw is
 * loaded), `<img>` (we don't ship attachments in v1), and headings
 * (chat messages don't need h1-h6 — heading syntax in a message is
 * almost always accidental, so we render it as plain text).
 *
 * Links open in a new tab by default with `rel="noopener noreferrer"` so a
 * malicious link can't `window.opener` back into the playbook page.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed marker:text-muted [&>p]:my-0">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-primary/40 pl-3 text-foreground/70 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border" />,
  code: ({ children }) => (
    <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-1 overflow-x-auto rounded-md bg-black/10 p-2 font-mono text-xs">
      {children}
    </pre>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
};

export function MessageMarkdown({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  return (
    <div
      className={`whitespace-pre-wrap break-words text-sm text-foreground ${className ?? ""}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS}
        // Drop images and headings. unwrapDisallowed=true means the inner
        // text still renders — so `# my heading` shows as "my heading" rather
        // than disappearing.
        disallowedElements={["img", "h1", "h2", "h3", "h4", "h5", "h6"]}
        unwrapDisallowed
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
