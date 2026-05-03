"use client";

import { Children, createContext, Fragment, isValidElement, useContext, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Player } from "@/domain/play/types";
import { PlayerChip } from "@/features/editor/PlayerChip";
import { coachDiagramToPlayDocument, type CoachDiagram } from "./coachDiagramConverter";
import { PlayDiagramEmbed, PlayDiagramRef } from "./PlayDiagramEmbed";

/**
 * Map from uppercase player label → Player, derived from any `play`
 * fence in the assistant message. Used by markdown-component overrides
 * (p / li / strong / em / h*) to replace `@Label` text tokens with the
 * same colored chip the play-notes editor uses (PlayerChip).
 *
 * Surfaced 2026-05-02: a coach asked for the chat to use the same
 * @Label-as-colored-circle convention as the play-notes panel. Reuses
 * PlayerChip directly so the visual is identical across both surfaces.
 */
const ChatPlayersContext = createContext<Map<string, Player> | null>(null);

/** Pull all players from any `play` fences in the message. Multiple
 *  fences merge into one map; later fences win on duplicate labels. */
function extractPlayersFromMessage(text: string): Map<string, Player> {
  const map = new Map<string, Player>();
  const re = /```play\s*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const diagram = JSON.parse(m[1]) as CoachDiagram;
      const doc = coachDiagramToPlayDocument(diagram);
      for (const p of doc.layers.players) {
        if (p.label) map.set(p.label.toUpperCase(), p);
      }
    } catch {
      // Streaming JSON or off-shape — skip this fence; @Label tokens
      // referring to its players will render as plain text rather than
      // crashing the renderer.
    }
  }
  return map;
}

/** Walk a React node and replace `@Label` text occurrences with
 *  inline PlayerChip components. Conservative: only replaces tokens
 *  whose label matches a known player; everything else passes
 *  through unchanged. */
function replaceAtLabels(
  node: React.ReactNode,
  players: Map<string, Player>,
  keyPrefix = "atl",
): React.ReactNode {
  if (typeof node === "string") {
    if (!node.includes("@")) return node;
    const re = /@([A-Za-z][A-Za-z0-9]{0,3})\b/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(node)) !== null) {
      const player = players.get(m[1].toUpperCase());
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
        {replaceAtLabels(child, players, `${keyPrefix}-i${i}`)}
      </Fragment>
    ));
  }
  if (isValidElement(node)) {
    const elem = node as React.ReactElement<{ children?: React.ReactNode }>;
    const props = elem.props as { children?: React.ReactNode };
    if (props && "children" in props) {
      return {
        ...elem,
        props: { ...props, children: replaceAtLabels(props.children, players, keyPrefix) },
      } as React.ReactElement;
    }
  }
  return node;
}

/** Hook returning a child-walker that, when there are players in
 *  context, replaces `@Label` tokens with chips. When there are no
 *  players (no play fence in the message), returns children as-is.
 *  Designed to be called once at the top of each markdown-component
 *  override that wraps prose. */
function useAtLabelChildren(children: React.ReactNode): React.ReactNode {
  const players = useContext(ChatPlayersContext);
  if (!players || players.size === 0) return children;
  return replaceAtLabels(children, players);
}

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

  // NEVER hide a play diagram inside the collapsible details section.
  // Diagrams are the primary content — coaches expect to SEE the play,
  // not click "Show details" to reveal it. If the model put a ```play
  // (or ```play-ref) fence under the Details heading, hoist the fence
  // back into the preamble so it renders inline. Same for ```diagram
  // (text football diagram) and any other code fence with a custom
  // language tag — those are visualizations, not deep-dive prose.
  const fenceRe = /```(play|play-ref|diagram)\s*\n[\s\S]*?\n```/g;
  const fences = after.match(fenceRe) ?? [];
  if (fences.length === 0) {
    return { preamble: text.slice(0, idx).trimEnd(), details: after };
  }
  const detailsWithoutFences = after.replace(fenceRe, "").replace(/\n{3,}/g, "\n\n").trim();
  const preambleWithFences = (text.slice(0, idx).trimEnd() + "\n\n" + fences.join("\n\n")).trim();
  return {
    preamble: preambleWithFences,
    details: detailsWithoutFences || null,
  };
}

/**
 * Inline "Show more" reveal for the body under `## Details`. Renders the
 * details prose directly below the preamble — no boxed disclosure — but
 * clips it to a few lines with a fade-out gradient until the coach taps
 * "Show more". Less hostile than the old binary "click to reveal" panel:
 * coaches see a peek of the depth and can opt in.
 *
 * Diagrams are already hoisted out of the details body by splitDetails(),
 * so the clipped region is always plain prose / lists / tables.
 */
function DetailsFade({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <div
        className={`relative overflow-hidden ${open ? "" : "max-h-[5.5em]"}`}
        aria-expanded={open}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
          {markdown}
        </ReactMarkdown>
        {!open && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface-raised to-transparent"
            aria-hidden
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 inline-flex items-center text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

function isInternalHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return false;
}

const PLAY_REF_RE     = /^play:\/\/([0-9a-f-]{8,})$/i;
const PLAYBOOK_REF_RE = /^playbook:\/\/([0-9a-f-]{8,})$/i;

/** Resolve Cal's `play://<id>` / `playbook://<id>` markdown links into the
 *  in-app routes the rest of the renderer treats as internal. Returns null if
 *  the href isn't a Cal-style ref. */
function resolveCoachRef(href: string): { route: string; kind: "play" | "playbook" } | null {
  const playMatch = PLAY_REF_RE.exec(href);
  if (playMatch) return { route: `/plays/${playMatch[1]}/edit`, kind: "play" };
  const pbMatch = PLAYBOOK_REF_RE.exec(href);
  if (pbMatch) return { route: `/playbooks/${pbMatch[1]}`, kind: "playbook" };
  return null;
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

// Named-PascalCase wrappers around the prose components — the
// react-hooks lint rule requires Hook callers to start with an
// uppercase letter, so we can't call useAtLabelChildren directly
// inside the lowercase react-markdown component overrides. These
// wrappers give the hook a properly-named host without changing
// rendering behavior.
type ChildrenProps = { children?: React.ReactNode };
const H1WithChips = ({ children }: ChildrenProps) => (
  <h1 className="mb-2 mt-3 text-base font-bold text-foreground first:mt-0">{useAtLabelChildren(children)}</h1>
);
const H2WithChips = ({ children }: ChildrenProps) => (
  <h2 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">{useAtLabelChildren(children)}</h2>
);
const H3WithChips = ({ children }: ChildrenProps) => (
  <h3 className="mb-1 mt-2 text-sm font-semibold text-foreground/80 first:mt-0">{useAtLabelChildren(children)}</h3>
);
const PWithChips = ({ children }: ChildrenProps) => (
  <p className="mb-2 leading-relaxed last:mb-0">{useAtLabelChildren(children)}</p>
);
const LiWithChips = ({ children }: ChildrenProps) => (
  <li className="leading-relaxed marker:text-muted [&>p]:mb-0">{useAtLabelChildren(children)}</li>
);
const StrongWithChips = ({ children }: ChildrenProps) => (
  <strong className="font-semibold text-foreground">{useAtLabelChildren(children)}</strong>
);
const EmWithChips = ({ children }: ChildrenProps) => (
  <em className="italic text-foreground/80">{useAtLabelChildren(children)}</em>
);

const components: Components = {
  h1: H1WithChips,
  h2: H2WithChips,
  h3: H3WithChips,

  p: PWithChips,

  ul: ({ children }) => (
    <ul className="mb-2 space-y-0.5 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
  ),
  li: LiWithChips,

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
  // Also resolve Cal-emitted `play://<id>` / `playbook://<id>` shortcuts to
  // their canonical routes — clicking pops the play/playbook into the main
  // content area without leaving the chat.
  a: ({ href, children }) => {
    const url = typeof href === "string" ? href : "";
    const coachRef = resolveCoachRef(url);
    if (coachRef) {
      return (
        <Link
          href={coachRef.route}
          className={
            "inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 " +
            "text-primary font-medium no-underline hover:bg-primary/20 transition-colors"
          }
        >
          {children}
        </Link>
      );
    }
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

  strong: StrongWithChips,
  em: EmWithChips,

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

// react-markdown's default url transform strips schemes outside of an
// allowlist (http, https, mailto, tel, …). Cal's `play://<id>` and
// `playbook://<id>` shortcuts get wiped silently without this override.
function urlTransform(url: string): string {
  if (PLAY_REF_RE.test(url) || PLAYBOOK_REF_RE.test(url)) return url;
  // Default-ish behavior for everything else: only allow safe-looking
  // protocols and same-origin paths through.
  if (/^(https?:|mailto:|tel:|#|\/[^/])/i.test(url)) return url;
  return "";
}

export function AssistantMessage({ text }: { text: string }) {
  const { preamble, details } = splitDetails(text);
  // Players parsed once per message and shared via context — both
  // preamble + details get the same chip mapping. Cheap (regex +
  // JSON parse + converter), and gracefully no-ops when no fence
  // is present.
  const players = useMemo(() => extractPlayersFromMessage(text), [text]);
  return (
    <ChatPlayersContext.Provider value={players}>
    <div className="text-sm text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
        {preamble}
      </ReactMarkdown>
      {details && <DetailsFade markdown={details} />}
    </div>
    </ChatPlayersContext.Provider>
  );
}
