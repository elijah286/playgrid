"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  archivePlayAction,
  createPlayAction,
  deletePlayAction,
  duplicatePlayAction,
  renamePlayAction,
  type PlaybookDetailPlayRow,
} from "@/app/actions/plays";
import { listFormationsAction } from "@/app/actions/formations";
import type { SavedFormation } from "@/app/actions/formations";
import type { Player, Route, SportVariant } from "@/domain/play/types";
import { resolveEndDecoration, resolveRouteStroke, sportProfileForVariant, SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import { routeToRenderedSegments } from "@/domain/play/geometry";
import type { PlaybookGroupRow } from "@/domain/print/playbookPrint";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";

type GroupBy = "formation" | "type" | "group" | "tag";

const UNASSIGNED = "__unassigned__";

export function PlaybookDetailClient({
  playbookId,
  sportVariant,
  initialPlays,
  initialGroups,
}: {
  playbookId: string;
  sportVariant: string;
  initialPlays: PlaybookDetailPlayRow[];
  initialGroups: PlaybookGroupRow[];
}) {
  const variant = sportVariant as SportVariant;
  const variantProfile = sportProfileForVariant(variant);
  const expectedPlayerCount = variantProfile.offensePlayerCount;
  const variantLabel = SPORT_VARIANT_LABELS[variant] ?? variant;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [groupBy, setGroupBy] = useState<GroupBy>("formation");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [thumbSize, setThumbSize] = useState<"none" | "compact" | "large">("compact");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Formation picker state
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [availableFormations, setAvailableFormations] = useState<SavedFormation[]>([]);
  const [loadingFormations, setLoadingFormations] = useState(false);
  const [creating, setCreating] = useState(false);

  const viewed = initialPlays.filter((p) =>
    view === "archived" ? p.is_archived : !p.is_archived,
  );
  const filtered = viewed.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.name.toLowerCase().includes(s) ||
      (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
      (p.shorthand && p.shorthand.toLowerCase().includes(s)) ||
      (p.concept && p.concept.toLowerCase().includes(s)) ||
      (p.formation_name && p.formation_name.toLowerCase().includes(s)) ||
      p.tags.some((t) => t.toLowerCase().includes(s))
    );
  });

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of initialGroups) m.set(g.id, g.name);
    return m;
  }, [initialGroups]);

  type Section = { key: string; label: string; plays: PlaybookDetailPlayRow[] };

  const sections: Section[] = useMemo(() => {
    const buckets = new Map<string, Section>();
    const pushInto = (key: string, label: string, p: PlaybookDetailPlayRow) => {
      const existing = buckets.get(key);
      if (existing) existing.plays.push(p);
      else buckets.set(key, { key, label, plays: [p] });
    };

    for (const p of filtered) {
      switch (groupBy) {
        case "formation": {
          const label = p.formation_name?.trim() || "Unassigned formation";
          pushInto(label.toLowerCase(), label, p);
          break;
        }
        case "type": {
          const label = p.concept?.trim() || "No type";
          pushInto(label.toLowerCase(), label, p);
          break;
        }
        case "group": {
          if (!p.group_id) pushInto(UNASSIGNED, "Ungrouped", p);
          else {
            const name = groupNameById.get(p.group_id) ?? "Ungrouped";
            pushInto(p.group_id, name, p);
          }
          break;
        }
        case "tag": {
          if (p.tags.length === 0) pushInto(UNASSIGNED, "Untagged", p);
          else for (const t of p.tags) pushInto(t.toLowerCase(), t, p);
          break;
        }
      }
    }

    const arr = Array.from(buckets.values());
    arr.sort((a, b) => {
      const aUn = a.key === UNASSIGNED || a.label.startsWith("Unassigned") || a.label === "Ungrouped" || a.label === "Untagged" || a.label === "No type";
      const bUn = b.key === UNASSIGNED || b.label.startsWith("Unassigned") || b.label === "Ungrouped" || b.label === "Untagged" || b.label === "No type";
      if (aUn !== bUn) return aUn ? 1 : -1;
      return a.label.localeCompare(b.label);
    });
    for (const s of arr) s.plays.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    return arr;
  }, [filtered, groupBy, groupNameById]);

  function openFormationPicker() {
    setShowFormationPicker(true);
    setLoadingFormations(true);
    listFormationsAction().then((res) => {
      if (res.ok) {
        setAvailableFormations(res.formations);
      }
      setLoadingFormations(false);
    });
  }

  async function createWithFormation(players?: Player[]) {
    setShowFormationPicker(false);
    setCreating(true);
    const res = await createPlayAction(playbookId, players);
    if (res.ok) {
      router.push(`/plays/${res.playId}/edit`);
    } else {
      setCreating(false);
      toast(res.error, "error");
    }
  }

  function handle<T>(fn: () => Promise<T>, onOk?: (r: T) => void) {
    startTransition(async () => {
      const res = await fn();
      if (res && typeof res === "object" && "ok" in res) {
        const r = res as { ok: boolean; error?: string };
        if (!r.ok) {
          toast(r.error ?? "Something went wrong.", "error");
          return;
        }
      }
      onOk?.(res);
      router.refresh();
    });
  }

  function onRenamePlay(id: string, current: string) {
    const next = window.prompt("Rename play", current);
    if (next == null) return;
    handle(() => renamePlayAction(id, next));
  }

  function confirmAnd(msg: string, fn: () => void) {
    if (window.confirm(msg)) fn();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            leftIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, code, formation, tag…"
          />
        </div>
        <SegmentedControl
          value={view}
          onChange={(v) => setView(v as "active" | "archived")}
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <Link href={`/playbooks/${playbookId}/print`}>
          <Button variant="secondary" leftIcon={Printer}>
            Print playbook
          </Button>
        </Link>
        <Button
          variant="primary"
          leftIcon={Plus}
          loading={creating}
          onClick={openFormationPicker}
        >
          New play
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Group by
        </span>
        <SegmentedControl
          value={groupBy}
          onChange={(v) => setGroupBy(v as GroupBy)}
          options={[
            { value: "formation", label: "Formation" },
            { value: "type", label: "Type" },
            { value: "group", label: "Group" },
            { value: "tag", label: "Tag" },
          ]}
        />
        <SegmentedControl
          value={viewMode}
          onChange={(v) => setViewMode(v as "cards" | "list")}
          options={[
            { value: "cards", label: "Cards", icon: LayoutGrid },
            { value: "list", label: "List", icon: List },
          ]}
        />
        {viewMode === "cards" && (
          <SegmentedControl
            value={thumbSize}
            onChange={(v) => setThumbSize(v as "none" | "compact" | "large")}
            options={[
              { value: "none", label: "No thumb" },
              { value: "compact", label: "Compact" },
              { value: "large", label: "Large" },
            ]}
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(new Set())}
        >
          Expand all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(new Set(sections.map((s) => s.key)))}
        >
          Collapse all
        </Button>
        <span className="ml-auto text-xs text-muted">
          {filtered.length} {filtered.length === 1 ? "play" : "plays"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          heading="No plays yet"
          description="Create your first play to start designing routes and formations."
          action={
            <Button variant="primary" leftIcon={Plus} onClick={openFormationPicker} loading={creating}>
              New play
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.key);
            const buildItems = (p: PlaybookDetailPlayRow): ActionMenuItem[] => [
              {
                label: "Rename",
                icon: Pencil,
                onSelect: () => onRenamePlay(p.id, p.name),
              },
              {
                label: "Duplicate",
                icon: Copy,
                onSelect: () =>
                  handle(
                    () => duplicatePlayAction(p.id),
                    (res) => {
                      if (res.ok) router.push(`/plays/${res.playId}/edit`);
                    },
                  ),
              },
              p.is_archived
                ? {
                    label: "Restore",
                    icon: ArchiveRestore,
                    onSelect: () => handle(() => archivePlayAction(p.id, false)),
                  }
                : {
                    label: "Archive",
                    icon: Archive,
                    onSelect: () => handle(() => archivePlayAction(p.id, true)),
                  },
              {
                label: "Delete",
                icon: Trash2,
                danger: true,
                onSelect: () =>
                  confirmAnd(
                    `Delete "${p.name}"? This can't be undone.`,
                    () => handle(() => deletePlayAction(p.id)),
                  ),
              },
            ];
            return (
              <section key={section.key} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="flex w-full items-center gap-2 border-b border-border pb-1.5 text-left hover:border-muted-light"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted" />
                  )}
                  <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
                  <Badge variant="default">{section.plays.length}</Badge>
                </button>
                {!isCollapsed && viewMode === "cards" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {section.plays.map((p) => (
                      <Card
                        key={`${section.key}:${p.id}`}
                        hover
                        className="relative flex flex-col p-0"
                      >
                        <Link
                          href={`/plays/${p.id}/edit`}
                          className="flex flex-1 flex-col p-4"
                          aria-label={`Open ${p.name}`}
                        >
                          <div className="flex items-start gap-2 pr-16">
                            <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground">
                              {p.name}
                            </h3>
                          </div>
                          {p.preview && thumbSize !== "none" && (
                            <div
                              className={
                                thumbSize === "compact"
                                  ? "mt-2 max-h-24 overflow-hidden"
                                  : "mt-2"
                              }
                            >
                              <PlayPreview preview={p.preview} />
                            </div>
                          )}
                          <p className="mt-2 truncate text-xs text-muted">
                            {[p.formation_name, p.concept].filter(Boolean).join(" · ") ||
                              p.shorthand ||
                              "No details"}
                          </p>
                          {p.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {p.tags.map((t) => (
                                <Badge key={t} variant="default">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Link>
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          {p.wristband_code && (
                            <Badge variant="primary">{p.wristband_code}</Badge>
                          )}
                          <ActionMenu items={buildItems(p)} />
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
                {!isCollapsed && viewMode === "list" && (
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
                    {section.plays.map((p) => (
                      <li
                        key={`${section.key}:${p.id}`}
                        className="flex items-center gap-2 pl-8 pr-2"
                      >
                        <Link
                          href={`/plays/${p.id}/edit`}
                          className="flex min-w-0 flex-1 items-center gap-3 py-2 hover:opacity-80"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {p.name}
                          </span>
                          <span className="truncate text-xs text-muted">
                            {[p.formation_name, p.concept].filter(Boolean).join(" · ") ||
                              p.shorthand ||
                              ""}
                          </span>
                          {p.wristband_code && (
                            <Badge variant="primary">{p.wristband_code}</Badge>
                          )}
                          {p.tags.length > 0 && (
                            <div className="hidden flex-wrap gap-1 md:flex">
                              {p.tags.slice(0, 3).map((t) => (
                                <Badge key={t} variant="default">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Link>
                        <ActionMenu items={buildItems(p)} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Formation picker overlay */}
      {showFormationPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFormationPicker(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface-raised shadow-elevated">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Choose a starting formation
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Pick a saved formation or start with the default.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
                onClick={() => setShowFormationPicker(false)}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6">
              {loadingFormations ? (
                <p className="text-center text-sm text-muted">Loading formations…</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    className="flex flex-col items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-center transition-colors hover:border-primary hover:bg-primary/10"
                    onClick={() => createWithFormation()}
                  >
                    <MiniPlayerDiagram players={null} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Default ({variantLabel})</p>
                      <p className="text-xs text-muted">Standard formation</p>
                    </div>
                  </button>

                  <Link
                    href={`/formations/new?variant=${variant}`}
                    className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <div className="flex size-20 items-center justify-center rounded-md bg-surface-raised text-muted">
                      <Plus className="size-7" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">New formation</p>
                      <p className="text-xs text-muted">Design from scratch</p>
                    </div>
                  </Link>

                  {availableFormations
                    .filter((f) => {
                      const fv = f.sportProfile?.variant as SportVariant | undefined;
                      if (fv) return fv === variant;
                      return f.players.length === expectedPlayerCount;
                    })
                    .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-inset p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
                      onClick={() => createWithFormation(f.players)}
                    >
                      <MiniPlayerDiagram players={f.players} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f.displayName}</p>
                        <p className="text-xs text-muted">
                          {f.players.length} players
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayPreview({
  preview,
}: {
  preview: { players: Player[]; routes: Route[] };
}) {
  // Render in normalized 0-1 field coords (same as editor) so zigzag,
  // curves, dashes and end decorations match the edited play exactly.
  const R = 0.032;

  // Compute bbox over every player + every route node, then stretch the
  // bbox to a fixed-aspect display area so all thumbnails are the same size.
  const PAD = R * 1.4;
  let minX = Infinity;
  let maxX = -Infinity;
  let minSvgY = Infinity;
  let maxSvgY = -Infinity;
  for (const p of preview.players) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    const sy = 1 - p.position.y;
    if (sy < minSvgY) minSvgY = sy;
    if (sy > maxSvgY) maxSvgY = sy;
  }
  for (const r of preview.routes) {
    for (const n of r.nodes) {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.x > maxX) maxX = n.position.x;
      const sy = 1 - n.position.y;
      if (sy < minSvgY) minSvgY = sy;
      if (sy > maxSvgY) maxSvgY = sy;
    }
  }
  if (!isFinite(minSvgY) || !isFinite(maxSvgY) || !isFinite(minX) || !isFinite(maxX)) {
    minX = 0;
    maxX = 1;
    minSvgY = 0.22;
    maxSvgY = 0.78;
  }
  const vbX = Math.max(0, minX - PAD);
  const vbW = Math.min(1, maxX + PAD) - vbX;
  const vbY = Math.max(0, minSvgY - PAD);
  const vbH = Math.min(1, maxSvgY + PAD) - vbY;

  // Container is a fixed 16:10 tile so every card is the same size. The
  // SVG viewBox stretches the content (routes, field) to fill. Per-player
  // transforms below counter that stretch so player shapes stay true.
  const TARGET = 16 / 10;
  const aspect = vbW / vbH;
  // Screen-space ratio scaleY / scaleX after preserveAspectRatio="none".
  // >1 when viewBox is wider than 16:10 (x is squished on screen, so we
  // widen shapes in viewBox units to compensate).
  const sxCorr = aspect / TARGET;

  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-border">
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      {/* Field: routes/players live in full 0-1 normalized space */}
      <g>
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#2D8B4E" />
        <line
          x1={0}
          y1={0.5}
          x2={1}
          y2={0.5}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={1}
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
        {preview.routes.map((r) => {
          const rendered = routeToRenderedSegments(r);
          const stroke = resolveRouteStroke(r, preview.players);
          return (
            <g key={r.id}>
              {rendered.map((rs) => (
                <path
                  key={rs.segmentId}
                  d={rs.d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.8}
                  strokeDasharray={rs.dash}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          );
        })}
        {preview.routes.map((r) => {
          const decoration = resolveEndDecoration(r);
          if (decoration === "none") return null;
          const fromIds = new Set(r.segments.map((s) => s.fromNodeId));
          const terminals = r.segments.filter((s) => !fromIds.has(s.toNodeId));
          const stroke = resolveRouteStroke(r, preview.players);
          return (
            <g key={`deco-${r.id}`}>
              {terminals.map((seg) => {
                const fromNode = r.nodes.find((n) => n.id === seg.fromNodeId);
                const toNode = r.nodes.find((n) => n.id === seg.toNodeId);
                if (!fromNode || !toNode) return null;
                const dirFromX = seg.shape === "curve" && seg.controlOffset
                  ? seg.controlOffset.x
                  : fromNode.position.x;
                const dirFromY = seg.shape === "curve" && seg.controlOffset
                  ? seg.controlOffset.y
                  : fromNode.position.y;
                const tipX = toNode.position.x;
                const tipY = 1 - toNode.position.y;
                const fromX = dirFromX;
                const fromY = 1 - dirFromY;
                const dxS = tipX - fromX;
                const dyS = tipY - fromY;
                const len = Math.hypot(dxS, dyS);
                if (len < 1e-4) return null;
                const ux = dxS / len;
                const uy = dyS / len;
                if (decoration === "arrow") {
                  const arrowLen = 0.035;
                  const cosA = Math.cos(Math.PI / 6);
                  const sinA = Math.sin(Math.PI / 6);
                  const bx = -ux;
                  const by = -uy;
                  const r1x = cosA * bx - sinA * by;
                  const r1y = sinA * bx + cosA * by;
                  const r2x = cosA * bx + sinA * by;
                  const r2y = -sinA * bx + cosA * by;
                  return (
                    <g key={seg.id}>
                      <line x1={tipX} y1={tipY} x2={tipX + arrowLen * r1x} y2={tipY + arrowLen * r1y} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      <line x1={tipX} y1={tipY} x2={tipX + arrowLen * r2x} y2={tipY + arrowLen * r2y} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                }
                if (decoration === "t") {
                  const halfLen = 0.028;
                  const perpX = -uy;
                  const perpY = ux;
                  return (
                    <line key={seg.id} x1={tipX + perpX * halfLen} y1={tipY + perpY * halfLen} x2={tipX - perpX * halfLen} y2={tipY - perpY * halfLen} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  );
                }
                return null;
              })}
            </g>
          );
        })}
        {preview.players.map((p) => {
          const cx = p.position.x;
          const cy = 1 - p.position.y;
          const shape = p.shape ?? "circle";
          const fill = p.style.fill;
          const strokeColor = p.style.stroke;
          const common = { fill, stroke: strokeColor, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
          // Shape drawn at origin, counter-scaled in x to undo the
          // preserveAspectRatio="none" stretch so circles stay round.
          let shapeEl: React.ReactNode;
          if (shape === "square") {
            shapeEl = <rect x={-R} y={-R} width={R * 2} height={R * 2} {...common} />;
          } else if (shape === "diamond") {
            shapeEl = <polygon points={`0,${-R} ${R},0 0,${R} ${-R},0`} {...common} />;
          } else if (shape === "triangle") {
            shapeEl = <polygon points={`0,${-R} ${R},${R} ${-R},${R}`} {...common} />;
          } else if (shape === "star") {
            const outer = R * 1.15;
            const inner = outer * 0.45;
            const pts = Array.from({ length: 10 }, (_, i) => {
              const angle = -Math.PI / 2 + (i * Math.PI) / 5;
              const rad = i % 2 === 0 ? outer : inner;
              return `${rad * Math.cos(angle)},${rad * Math.sin(angle)}`;
            }).join(" ");
            shapeEl = <polygon points={pts} strokeLinejoin="round" {...common} />;
          } else {
            shapeEl = <circle cx={0} cy={0} r={R} {...common} />;
          }
          return (
            <g key={p.id} transform={`translate(${cx} ${cy}) scale(${sxCorr} 1)`}>
              {shapeEl}
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={0.035}
                fontWeight={700}
                fill={p.style.labelColor}
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
    </div>
  );
}

function MiniPlayerDiagram({ players }: { players: Player[] | null }) {
  const SIZE = 80;
  const DOT_R = 4;

  if (!players) {
    return (
      <svg width={SIZE} height={SIZE} viewBox="0 0 80 80" className="opacity-60">
        <rect width={80} height={80} rx={6} fill="#2D8B4E" />
        {[
          [40, 68], [40, 58], [22, 48], [40, 48], [58, 48], [12, 36], [68, 36],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={DOT_R} fill="#FFFFFF" />
        ))}
      </svg>
    );
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 80 80">
      <rect width={80} height={80} rx={6} fill="#2D8B4E" />
      {players.map((pl) => {
        const cx = pl.position.x * SIZE;
        const cy = (1 - pl.position.y) * SIZE;
        return (
          <circle
            key={pl.id}
            cx={cx}
            cy={cy}
            r={DOT_R}
            fill={pl.style.fill}
            stroke={pl.style.stroke}
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
