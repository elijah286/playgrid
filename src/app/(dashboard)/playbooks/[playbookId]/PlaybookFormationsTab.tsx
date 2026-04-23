"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  Check,
  CheckSquare,
  Copy,
  FilePlus,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addFormationToSeedsAction,
  archiveFormationAction,
  deleteFormationAction,
  reorderFormationsAction,
  type SavedFormation,
} from "@/app/actions/formations";
import { CopyToPlaybookDialog, type CopyTarget } from "@/features/playbooks/CopyToPlaybookDialog";
import {
  ActionMenu,
  Button,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";
import type { SportVariant } from "@/domain/play/types";
import { useExamplePreview } from "@/features/admin/ExamplePreviewContext";

type SortableListeners = Record<string, (event: unknown) => void> | undefined;

function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (args: {
    setNodeRef: (el: HTMLElement | null) => void;
    style: CSSProperties;
    attributes: HTMLAttributes<HTMLElement>;
    listeners: SortableListeners;
    isDragging: boolean;
  }) => ReactNode;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } =
    useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <>
      {children({
        setNodeRef,
        style,
        attributes,
        listeners: listeners as SortableListeners,
        isDragging,
      })}
    </>
  );
}

export function PlaybookFormationsTab({
  playbookId,
  playbookName,
  variant,
  initial,
  isAdmin = false,
}: {
  playbookId: string;
  playbookName: string;
  variant: SportVariant;
  initial: SavedFormation[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { isPreview } = useExamplePreview();
  const [formations, setFormations] = useState(initial);
  useEffect(() => {
    setFormations(initial);
  }, [initial]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const newFormationHref = (() => {
    const q = new URLSearchParams({
      variant,
      returnToPlaybook: playbookId,
    });
    if (isPreview) q.set("preview", "1");
    return `/formations/new?${q.toString()}`;
  })();

  const viewed = useMemo(
    () => formations.filter((f) => (view === "archived" ? f.isArchived : !f.isArchived)),
    [formations, view],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sorted = [...viewed].sort((a, b) => a.sortOrder - b.sortOrder);
    if (!needle) return sorted;
    return sorted.filter((f) => f.displayName.toLowerCase().includes(needle));
  }, [viewed, q]);

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const ordered = [...formations].sort((a, b) => a.sortOrder - b.sortOrder);
    const oldIndex = ordered.findIndex((f) => f.id === activeId);
    const newIndex = ordered.findIndex((f) => f.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(ordered, oldIndex, newIndex);
    const orderMap = new Map(moved.map((f, i) => [f.id, i]));
    setFormations((prev) =>
      prev.map((f) => ({ ...f, sortOrder: orderMap.get(f.id) ?? f.sortOrder })),
    );

    const ids = moved.map((f) => f.id);
    startTransition(async () => {
      const res = await reorderFormationsAction(playbookId, ids);
      if (!res.ok) {
        toast(res.error ?? "Could not save formation order.", "error");
        router.refresh();
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteFormationAction(id);
      if (res.ok) {
        setFormations((prev) => prev.filter((f) => f.id !== id));
        toast(`"${name}" deleted.`, "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

  function handleArchive(f: SavedFormation) {
    const next = !f.isArchived;
    startTransition(async () => {
      const res = await archiveFormationAction(f.id, next);
      if (res.ok) {
        setFormations((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, isArchived: next } : x)),
        );
        toast(`"${f.displayName}" ${next ? "archived" : "restored"}.`, "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

  function handleCopy(formation: SavedFormation) {
    setCopyTarget({
      kind: "formation",
      formationId: formation.id,
      formationName: formation.displayName,
    });
  }

  function handleAddAsSeed(formation: SavedFormation) {
    startTransition(async () => {
      const res = await addFormationToSeedsAction(formation.id);
      if (res.ok) {
        toast(`"${formation.displayName}" added to seeds.`, "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

  function bulkArchive() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const archiving = view !== "archived";
    startTransition(async () => {
      for (const id of ids) {
        const res = await archiveFormationAction(id, archiving);
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
      }
      setFormations((prev) =>
        prev.map((f) => (selectedIds.has(f.id) ? { ...f, isArchived: archiving } : f)),
      );
      toast(
        `${ids.length} ${ids.length === 1 ? "formation" : "formations"} ${archiving ? "archived" : "restored"}.`,
        "success",
      );
      setSelectionMode(false);
      setSelectedIds(new Set());
    });
  }

  function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const n = ids.length;
    if (!window.confirm(`Delete ${n} ${n === 1 ? "formation" : "formations"}? This can't be undone.`)) return;
    startTransition(async () => {
      for (const id of ids) {
        const res = await deleteFormationAction(id);
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
      }
      setFormations((prev) => prev.filter((f) => !selectedIds.has(f.id)));
      toast(`${n} ${n === 1 ? "formation" : "formations"} deleted.`, "success");
      setSelectionMode(false);
      setSelectedIds(new Set());
    });
  }

  const visibleIds = visible.map((f) => f.id);
  const allVisibleSelected =
    visible.length > 0 && visible.every((f) => selectedIds.has(f.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            leftIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search formations…"
          />
        </div>
        <SegmentedControl
          size="sm"
          value={view}
          onChange={(v) => setView(v as "active" | "archived")}
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <Button
          variant={selectionMode ? "primary" : "secondary"}
          leftIcon={CheckSquare}
          onClick={() => {
            if (selectionMode) {
              setSelectionMode(false);
              setSelectedIds(new Set());
            } else {
              setReorderMode(false);
              setSelectionMode(true);
            }
          }}
          aria-label={selectionMode ? "Cancel selection" : "Select formations"}
          title={selectionMode ? "Cancel selection" : "Select formations"}
          className="hidden px-2.5 sm:inline-flex"
        >
          <span className="sr-only">{selectionMode ? "Cancel" : "Select"}</span>
        </Button>
        <Button
          variant={reorderMode ? "primary" : "secondary"}
          leftIcon={ArrowUpDown}
          onClick={() => {
            if (reorderMode) {
              setReorderMode(false);
            } else {
              setSelectionMode(false);
              setSelectedIds(new Set());
              setReorderMode(true);
            }
          }}
          aria-label={reorderMode ? "Done reordering" : "Reorder formations"}
          title={reorderMode ? "Done reordering" : "Reorder formations"}
          className="hidden sm:inline-flex"
        >
          {reorderMode ? "Done" : "Reorder"}
        </Button>
        <Link href={newFormationHref} className="hidden sm:inline-flex">
          <Button variant="primary" leftIcon={Plus}>
            New formation
          </Button>
        </Link>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Plus}
          heading={q ? "No matches" : view === "archived" ? "No archived formations" : "No formations in this playbook"}
          description={
            q
              ? "Try a different search term."
              : view === "archived"
                ? "Archived formations will appear here."
                : "Create one below, or add compatible formations from your global library."
          }
          action={
            !q && view === "active" ? (
              <Link href={newFormationHref}>
                <Button variant="primary" leftIcon={Plus}>
                  New formation
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DndContext
          sensors={dragSensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragId(null)}
        >
          <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visible.map((f) => {
                const isSelected = selectedIds.has(f.id);
                return (
                  <SortableItem key={f.id} id={f.id} disabled={!reorderMode}>
                    {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                      <FormationCard
                        ref={setNodeRef}
                        style={style}
                        dragAttributes={reorderMode ? attributes : undefined}
                        dragListeners={reorderMode ? listeners : undefined}
                        isDragging={isDragging}
                        reorderMode={reorderMode}
                        selectionMode={selectionMode}
                        isSelected={isSelected}
                        onToggleSelect={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(f.id)) next.delete(f.id);
                            else next.add(f.id);
                            return next;
                          });
                        }}
                        formation={f}
                        isAdmin={isAdmin}
                        onEdit={() =>
                          router.push(
                            `/formations/${f.id}/edit?returnToPlaybook=${playbookId}`,
                          )
                        }
                        onCreatePlay={() =>
                          router.push(
                            `/plays/new?playbookId=${playbookId}&formationId=${f.id}`,
                          )
                        }
                        onCopy={handleCopy}
                        onDelete={handleDelete}
                        onArchive={handleArchive}
                        onAddAsSeed={handleAddAsSeed}
                      />
                    )}
                  </SortableItem>
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
            {activeDragId
              ? (() => {
                  const f = formations.find((x) => x.id === activeDragId);
                  if (!f) return null;
                  return (
                    <Card className="relative flex cursor-grabbing flex-col p-0 shadow-elevated ring-2 ring-primary">
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="truncate font-semibold text-foreground">
                          {f.displayName}
                        </h3>
                        <div className="mt-2">
                          <FormationThumbnail formation={f} />
                        </div>
                        <p className="mt-2 truncate text-xs text-muted">
                          {f.players.length} players
                        </p>
                      </div>
                    </Card>
                  );
                })()
              : null}
          </DragOverlay>
        </DndContext>
      )}

      {reorderMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface-raised px-4 py-2 shadow-elevated">
            <ArrowUpDown className="size-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Drag formations to reorder
            </span>
            <Button variant="primary" size="sm" onClick={() => setReorderMode(false)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {selectionMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-surface-raised px-4 py-2 shadow-elevated sm:gap-3 sm:rounded-full">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (allVisibleSelected) {
                    for (const id of visibleIds) next.delete(id);
                  } else {
                    for (const id of visibleIds) next.add(id);
                  }
                  return next;
                });
              }}
            >
              {allVisibleSelected ? "Clear visible" : "Select all visible"}
            </button>
            <button
              type="button"
              className="text-xs font-medium text-muted hover:text-foreground"
              onClick={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
            >
              Cancel
            </button>
            <Button
              variant="ghost"
              leftIcon={view === "archived" ? ArchiveRestore : Archive}
              disabled={selectedIds.size === 0}
              onClick={bulkArchive}
            >
              {view === "archived" ? "Restore" : "Archive"}
            </Button>
            <Button
              variant="ghost"
              leftIcon={Trash2}
              disabled={selectedIds.size === 0}
              onClick={bulkDelete}
              className="text-danger hover:text-danger"
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {copyTarget && (
        <CopyToPlaybookDialog
          open={!!copyTarget}
          onClose={() => setCopyTarget(null)}
          currentPlaybookId={playbookId}
          currentPlaybookName={playbookName}
          currentSportVariant={variant}
          target={copyTarget}
          toast={toast}
          onCopied={(result) => {
            if (result.playbookId === playbookId && result.formationId) {
              router.push(`/formations/${result.formationId}/edit?returnToPlaybook=${playbookId}`);
            } else {
              router.push(`/playbooks/${result.playbookId}?tab=formations`);
            }
          }}
        />
      )}
    </div>
  );
}

type FormationCardProps = {
  formation: SavedFormation;
  isAdmin: boolean;
  onEdit: () => void;
  onCreatePlay: () => void;
  onCopy: (formation: SavedFormation) => void;
  onDelete: (id: string, name: string) => void;
  onArchive: (formation: SavedFormation) => void;
  onAddAsSeed: (formation: SavedFormation) => void;
  reorderMode: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  isDragging: boolean;
  onToggleSelect: () => void;
  style?: CSSProperties;
  dragAttributes?: HTMLAttributes<HTMLElement>;
  dragListeners?: SortableListeners;
};

const FormationCard = function FormationCard({
  ref,
  formation,
  isAdmin,
  onEdit,
  onCreatePlay,
  onCopy,
  onDelete,
  onArchive,
  onAddAsSeed,
  reorderMode,
  selectionMode,
  isSelected,
  isDragging,
  onToggleSelect,
  style,
  dragAttributes,
  dragListeners,
}: FormationCardProps & { ref?: (el: HTMLElement | null) => void }) {
  const items: ActionMenuItem[] = [
    { label: "Create play using formation", icon: FilePlus, onSelect: onCreatePlay },
    { label: "Edit", icon: Pencil, onSelect: onEdit },
    { label: "Copy", icon: Copy, onSelect: () => onCopy(formation) },
    formation.isArchived
      ? {
          label: "Restore",
          icon: ArchiveRestore,
          onSelect: () => onArchive(formation),
        }
      : {
          label: "Archive",
          icon: Archive,
          onSelect: () => onArchive(formation),
        },
  ];
  if (isAdmin) {
    items.push({
      label: "Add as seed",
      icon: Sparkles,
      onSelect: () => onAddAsSeed(formation),
    });
  }
  items.push({
    label: "Delete",
    icon: Trash2,
    danger: true,
    onSelect: () => onDelete(formation.id, formation.displayName),
  });

  return (
    <Card
      ref={ref}
      style={style}
      hover
      {...(reorderMode ? dragAttributes : {})}
      {...(reorderMode && dragListeners ? dragListeners : {})}
      className={`relative flex flex-col p-0 ${
        reorderMode
          ? "cursor-grab touch-none select-none active:cursor-grabbing"
          : selectionMode
            ? "cursor-pointer"
            : ""
      } ${isSelected ? "ring-2 ring-primary" : ""} ${isDragging ? "opacity-40" : ""}`}
      onClick={
        selectionMode
          ? (e) => {
              e.preventDefault();
              onToggleSelect();
            }
          : undefined
      }
    >
      {selectionMode && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded border-2 border-primary bg-surface-raised">
          {isSelected && <Check className="size-3.5 text-primary" />}
        </div>
      )}
      <button
        type="button"
        onClick={onEdit}
        disabled={reorderMode || selectionMode}
        className={`flex flex-1 flex-col p-4 text-left ${
          reorderMode || selectionMode ? "pointer-events-none" : ""
        }`}
        tabIndex={reorderMode || selectionMode ? -1 : 0}
      >
        <div className="flex items-start gap-1.5 pr-8">
          <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {formation.displayName}
          </h3>
        </div>

        <div className="mt-2">
          <FormationThumbnail formation={formation} />
        </div>

        <p className="mt-2 truncate text-xs text-muted">
          {formation.players.length} players
        </p>
      </button>

      {!reorderMode && !selectionMode && (
        <div className="absolute right-2 top-2">
          <ActionMenu items={items} />
        </div>
      )}
    </Card>
  );
};

export function FormationThumbnail({ formation }: { formation: SavedFormation }) {
  const R = 0.032;
  const PAD = R * 1.6;

  let minX = Infinity;
  let maxX = -Infinity;
  let minSvgY = Infinity;
  let maxSvgY = -Infinity;
  for (const p of formation.players) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    const sy = 1 - p.position.y;
    if (sy < minSvgY) minSvgY = sy;
    if (sy > maxSvgY) maxSvgY = sy;
  }
  if (!isFinite(minX)) {
    minX = 0;
    maxX = 1;
    minSvgY = 0.22;
    maxSvgY = 0.78;
  }

  const losY = 1 - 0.4;
  const fiveY = 1 - 0.6;
  const tenY = 1 - 0.8;
  minSvgY = Math.min(minSvgY, tenY);
  maxSvgY = Math.max(maxSvgY, losY);

  let vbX = Math.max(0, minX - PAD);
  let vbW = Math.min(1, maxX + PAD) - vbX;
  let vbY = Math.max(0, minSvgY - PAD);
  let vbH = Math.min(1, maxSvgY + PAD) - vbY;

  const TARGET = 16 / 10;
  const currentAspect = vbW / vbH;
  if (currentAspect < TARGET) {
    const needed = vbH * TARGET;
    const extra = needed - vbW;
    vbX = Math.max(0, vbX - extra / 2);
    vbW = Math.min(1 - vbX, needed);
  } else if (currentAspect > TARGET) {
    const needed = vbW / TARGET;
    const extra = needed - vbH;
    vbY = Math.max(0, vbY - extra / 2);
    vbH = Math.min(1 - vbY, needed);
  }

  const aspect = vbW / vbH;
  const sxCorr = aspect / TARGET;

  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-surface-inset">
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <line
          x1={vbX}
          x2={vbX + vbW}
          y1={losY}
          y2={losY}
          stroke="rgba(100,116,139,0.45)"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={vbX}
          x2={vbX + vbW}
          y1={fiveY}
          y2={fiveY}
          stroke="rgba(100,116,139,0.3)"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={vbX}
          x2={vbX + vbW}
          y1={tenY}
          y2={tenY}
          stroke="rgba(100,116,139,0.3)"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />

        {formation.players.map((p) => {
          const cx = p.position.x;
          const cy = 1 - p.position.y;
          return (
            <g key={p.id} transform={`translate(${cx} ${cy}) scale(${sxCorr} 1)`}>
              <circle
                cx={0}
                cy={0}
                r={R}
                fill={p.style.fill}
                stroke={p.style.stroke}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
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
      </svg>
    </div>
  );
}
