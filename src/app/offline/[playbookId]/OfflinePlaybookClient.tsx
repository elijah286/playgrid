"use client";

import { Component, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw, Search, WifiOff } from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import { Button, Input } from "@/components/ui";
import {
  getCachedPlaybookMeta,
  getCachedPlays,
  getCachedPlayDocuments,
  type CachedPlaybookMeta,
  type CachedPlayRow,
} from "@/lib/offline/db";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
import { PlayDocRender } from "@/features/coach-ai/PlayDiagramEmbed";

type Props = { playbookId: string };

type PlayKind = "all" | "offense" | "defense" | "special_teams";
const KIND_LABELS: Record<PlayKind, string> = {
  all: "All",
  offense: "Offense",
  defense: "Defense",
  special_teams: "Special teams",
};
const KIND_BADGE: Record<string, string> = {
  defense: "Defense",
  special_teams: "ST",
};

/** Build the thumbnail input from a cached PlayDocument (same shape the
 *  online playbook grid feeds PlayThumbnail). */
function previewFromDoc(doc: PlayDocument | undefined): PlayThumbnailInput | null {
  if (!doc?.layers) return null;
  return {
    players: doc.layers.players ?? [],
    routes: doc.layers.routes ?? [],
    zones: doc.layers.zones ?? [],
    lineOfScrimmageY: doc.lineOfScrimmageY ?? 0.5,
  };
}

/** Team logo when it's available offline (cached image), else the colored
 *  initial tile — mirrors the playbook's identity on the online page. */
function PlaybookMark({ meta, size }: { meta: CachedPlaybookMeta; size: number }) {
  const [imgOk, setImgOk] = useState(true);
  const px = { width: size, height: size };
  if (meta.logoUrl && imgOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={meta.logoUrl}
        alt=""
        style={px}
        onError={() => setImgOk(false)}
        className="shrink-0 rounded-lg object-contain"
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg text-white"
      style={{ ...px, backgroundColor: meta.color }}
    >
      <span className="text-sm font-bold">{(meta.name[0] ?? "?").toUpperCase()}</span>
    </div>
  );
}

export function OfflinePlaybookClient({ playbookId }: Props) {
  const [meta, setMeta] = useState<CachedPlaybookMeta | null>(null);
  const [plays, setPlays] = useState<CachedPlayRow[] | null>(null);
  const [docsById, setDocsById] = useState<Map<string, PlayDocument>>(new Map());
  // null → grid view; a play id → that play's full diagram (detail view).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PlayKind>("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getCachedPlaybookMeta(playbookId),
      getCachedPlays(playbookId),
      getCachedPlayDocuments(playbookId),
    ])
      .then(([m, ps, docs]) => {
        if (!alive) return;
        setMeta(m);
        setPlays([...ps].sort((a, b) => a.name.localeCompare(b.name)));
        setDocsById(docs as Map<string, PlayDocument>);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : "Couldn't load.");
      });
    return () => {
      alive = false;
    };
  }, [playbookId]);

  const filtered = useMemo(() => {
    if (!plays) return [];
    const s = q.trim().toLowerCase();
    return plays.filter((p) => {
      if (kind !== "all" && p.playType !== kind) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        (p.wristbandCode && p.wristbandCode.toLowerCase().includes(s)) ||
        (p.shorthand && p.shorthand.toLowerCase().includes(s))
      );
    });
  }, [plays, q, kind]);

  // Hide a tab when the playbook has zero plays of that type — most flag
  // playbooks ship offense + defense but not ST, and an empty tab feels
  // broken.
  const availableKinds: PlayKind[] = useMemo(() => {
    if (!plays || plays.length === 0) return ["all"];
    const present = new Set(plays.map((p) => p.playType));
    const kinds: PlayKind[] = ["all"];
    if (present.has("offense")) kinds.push("offense");
    if (present.has("defense")) kinds.push("defense");
    if (present.has("special_teams")) kinds.push("special_teams");
    return kinds;
  }, [plays]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <WifiOff className="mx-auto size-8 text-muted" />
        <p className="mt-2 text-sm font-medium text-foreground">
          Couldn&rsquo;t open this offline copy
        </p>
        <p className="mt-1 text-xs text-muted">{loadError}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setLoadError(null);
              setPlays(null);
              // The SW serves the cached HTML, so a reload is offline-safe and
              // re-runs the IndexedDB reads from scratch.
              window.location.reload();
            }}
          >
            Try again
          </Button>
          <a
            href="/offline"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-surface-inset"
          >
            Back
          </a>
        </div>
      </div>
    );
  }

  if (plays === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="h-10 w-1/3 animate-pulse rounded bg-surface-inset" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[16/10] animate-pulse rounded-lg bg-surface-inset" />
          ))}
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <WifiOff className="mx-auto size-8 text-muted" />
        <p className="mt-2 text-sm font-medium text-foreground">
          This playbook isn&rsquo;t downloaded
        </p>
        <p className="mt-1 text-xs text-muted">
          Open it once with a connection and tap &ldquo;Download for offline&rdquo;
          to keep a copy on this device.
        </p>
        <a
          href="/offline"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to offline library
        </a>
      </div>
    );
  }

  // ── Detail view: the tapped play's full canonical diagram ─────────────────
  const selectedPlay = selectedId ? plays.find((p) => p.id === selectedId) : null;
  const selectedDoc = selectedId ? docsById.get(selectedId) : undefined;
  if (selectedPlay) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>{meta.name}</span>
        </button>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-bold text-foreground">{selectedPlay.name}</h1>
          {selectedPlay.wristbandCode && (
            <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-white">
              {selectedPlay.wristbandCode}
            </span>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          {selectedDoc ? (
            <PlayRenderBoundary key={selectedId}>
              <div className="flex justify-center">
                <PlayDocRender doc={selectedDoc} />
              </div>
            </PlayRenderBoundary>
          ) : (
            <div className="flex h-64 items-center justify-center text-center text-sm text-muted">
              This play&rsquo;s diagram isn&rsquo;t in the offline copy. Re-download
              the playbook when you&rsquo;re back online.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Grid view: mirrors the online playbook page ───────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <a
          href="/offline"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>Offline</span>
        </a>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-inset px-2.5 py-1 text-[11px] font-medium text-muted">
          <WifiOff className="size-3" />
          Offline copy
        </span>
      </div>

      <div className="flex items-center gap-3">
        <PlaybookMark meta={meta} size={40} />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-foreground">{meta.name}</h1>
          <p className="text-xs text-muted">
            {meta.playCount} {meta.playCount === 1 ? "play" : "plays"}
            {meta.season ? ` · ${meta.season}` : ""}
          </p>
        </div>
      </div>

      <Input
        leftIcon={Search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search plays"
      />
      {availableKinds.length > 2 && (
        <div className="-mx-0.5 flex gap-1 overflow-x-auto pb-0.5">
          {availableKinds.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                kind === k
                  ? "bg-primary text-white"
                  : "bg-surface-inset text-muted hover:text-foreground"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-10 text-center text-sm text-muted">
          No plays match.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((p) => {
            const preview = previewFromDoc(docsById.get(p.id));
            const badge = KIND_BADGE[p.playType];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface-raised p-2 text-left transition-colors hover:border-primary/50 hover:bg-surface-inset"
              >
                {preview ? (
                  <PlayThumbnail preview={preview} />
                ) : (
                  <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-border bg-surface-inset text-[11px] text-muted">
                    No diagram
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {p.name}
                  </span>
                  {p.wristbandCode && (
                    <span className="shrink-0 text-xs font-medium text-muted">
                      {p.wristbandCode}
                    </span>
                  )}
                </div>
                {badge && (
                  <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-surface">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

class PlayRenderBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="size-7 text-muted" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              This play couldn&rsquo;t render
            </p>
            <p className="text-xs text-muted">
              Pick another play, or re-download the playbook when you&rsquo;re
              back online.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={RefreshCw}
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
