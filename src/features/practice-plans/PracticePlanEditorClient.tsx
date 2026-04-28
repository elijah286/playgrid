"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2, Loader2, GripVertical } from "lucide-react";
import {
  computeTotalDurationMinutes,
  formatOffset,
  PRACTICE_PLAN_SCHEMA_VERSION,
  type BlockLane,
  type PracticePlanDocument,
  type TimeBlock,
} from "@/domain/practice-plan/types";
import {
  renamePracticePlanAction,
  savePracticePlanVersionAction,
} from "@/app/actions/practice-plans";
import { EquipmentDiagramPreview } from "./EquipmentDiagramPreview";

function uid(): string {
  return crypto.randomUUID();
}

function emptyLane(orderIndex: number): BlockLane {
  return {
    id: uid(),
    orderIndex,
    title: "",
    notes: "",
    diagram: null,
  };
}

function emptyBlock(prevEnd: number, orderIndex: number): TimeBlock {
  return {
    id: uid(),
    orderIndex,
    startOffsetMinutes: prevEnd,
    durationMinutes: 10,
    title: "New block",
    notes: "",
    lanes: [emptyLane(0)],
  };
}

export function PracticePlanEditorClient({
  planId,
  playbookId,
  initialTitle,
  initialDocument,
}: {
  planId: string;
  playbookId: string;
  initialTitle: string;
  initialDocument: PracticePlanDocument;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [doc, setDoc] = useState<PracticePlanDocument>(() => ({
    ...initialDocument,
    schemaVersion: PRACTICE_PLAN_SCHEMA_VERSION,
  }));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialDocument.blocks[0]?.id ?? null,
  );
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(
    initialDocument.blocks[0]?.lanes[0]?.id ?? null,
  );
  const [saving, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalDuration = useMemo(
    () => computeTotalDurationMinutes(doc.blocks),
    [doc.blocks],
  );

  const updateDoc = useCallback(
    (mutator: (d: PracticePlanDocument) => PracticePlanDocument) => {
      setDoc((prev) => mutator(prev));
    },
    [],
  );

  const handleSave = useCallback(() => {
    startSave(async () => {
      const next: PracticePlanDocument = {
        ...doc,
        totalDurationMinutes: totalDuration,
      };
      const [saveRes, renameRes] = await Promise.all([
        savePracticePlanVersionAction(planId, next, { label: "Edit" }),
        title !== initialTitle
          ? renamePracticePlanAction(planId, title)
          : Promise.resolve({ ok: true as const }),
      ]);
      if (!saveRes.ok) {
        setError(saveRes.error);
        return;
      }
      if (!renameRes.ok) {
        setError(renameRes.error);
        return;
      }
      setSavedAt(new Date());
      setError(null);
    });
  }, [doc, planId, title, initialTitle, totalDuration]);

  const addBlock = () => {
    const lastEnd =
      doc.blocks.length === 0
        ? 0
        : doc.blocks[doc.blocks.length - 1].startOffsetMinutes +
          doc.blocks[doc.blocks.length - 1].durationMinutes;
    const block = emptyBlock(lastEnd, doc.blocks.length);
    updateDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedBlockId(block.id);
    setSelectedLaneId(block.lanes[0].id);
  };

  const deleteBlock = (blockId: string) => {
    updateDoc((d) => ({
      ...d,
      blocks: d.blocks
        .filter((b) => b.id !== blockId)
        .map((b, i) => ({ ...b, orderIndex: i })),
    }));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
      setSelectedLaneId(null);
    }
  };

  const updateBlock = (blockId: string, patch: Partial<TimeBlock>) => {
    updateDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
  };

  const addLane = (blockId: string) => {
    updateDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              lanes: [...b.lanes, emptyLane(b.lanes.length)],
            }
          : b,
      ),
    }));
  };

  const removeLane = (blockId: string, laneId: string) => {
    updateDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              lanes: b.lanes
                .filter((l) => l.id !== laneId)
                .map((l, i) => ({ ...l, orderIndex: i })),
            }
          : b,
      ),
    }));
    if (selectedLaneId === laneId) setSelectedLaneId(null);
  };

  const updateLane = (
    blockId: string,
    laneId: string,
    patch: Partial<BlockLane>,
  ) => {
    updateDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              lanes: b.lanes.map((l) =>
                l.id === laneId ? { ...l, ...patch } : l,
              ),
            }
          : b,
      ),
    }));
  };

  const selectedBlock =
    selectedBlockId ? doc.blocks.find((b) => b.id === selectedBlockId) ?? null : null;
  const selectedLane =
    selectedBlock && selectedLaneId
      ? selectedBlock.lanes.find((l) => l.id === selectedLaneId) ?? null
      : null;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/playbooks/${playbookId}?tab=practice_plans`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-base font-semibold hover:border-border focus:border-primary focus:outline-none"
          />
          <span className="whitespace-nowrap text-xs text-muted">
            {totalDuration > 0 ? `Total ${formatOffset(totalDuration)}` : "No blocks"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-xs text-muted">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Body: split view — timeline blocks (1/3) + lane editor (2/3) */}
      <div className="flex min-h-0 flex-1">
        {/* Left: timeline */}
        <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-border bg-surface/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Timeline
            </h3>
            <button
              type="button"
              onClick={addBlock}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              <Plus className="h-3 w-3" />
              Add block
            </button>
          </div>
          {doc.blocks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted">
              No blocks yet. Add your first block to start.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {doc.blocks.map((block) => {
                const active = block.id === selectedBlockId;
                return (
                  <li key={block.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBlockId(block.id);
                        setSelectedLaneId(block.lanes[0]?.id ?? null);
                      }}
                      className={`block w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-3 w-3 shrink-0 text-muted" />
                        <span className="font-mono text-xs tabular-nums text-muted">
                          {formatOffset(block.startOffsetMinutes)}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {block.title || "Untitled"}
                        </span>
                        <span className="ml-auto whitespace-nowrap text-xs text-muted">
                          {block.durationMinutes}m
                        </span>
                      </div>
                      {block.lanes.length > 1 && (
                        <div className="mt-1 flex flex-wrap gap-1 pl-5">
                          {block.lanes.map((l) => (
                            <span
                              key={l.id}
                              className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] text-muted"
                            >
                              {l.title || "Lane"}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Right: block + lane editor */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedBlock ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Select a block on the left, or add a new one to get started.
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {/* Block-level controls */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                      Block title
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.title}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { title: e.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteBlock(selectedBlock.id)}
                    className="mt-5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                      Start
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={selectedBlock.startOffsetMinutes}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, {
                          startOffsetMinutes: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums"
                    />
                    <p className="mt-0.5 text-[10px] text-muted">minutes from 0:00</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                      Duration
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={selectedBlock.durationMinutes}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, {
                          durationMinutes: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums"
                    />
                    <p className="mt-0.5 text-[10px] text-muted">minutes</p>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Notes
                  </label>
                  <textarea
                    value={selectedBlock.notes}
                    onChange={(e) =>
                      updateBlock(selectedBlock.id, { notes: e.target.value })
                    }
                    rows={2}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder="Coaching notes for this block (optional)…"
                  />
                </div>
              </div>

              {/* Lanes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Activities ({selectedBlock.lanes.length})
                  </h3>
                  {selectedBlock.lanes.length < 3 && (
                    <button
                      type="button"
                      onClick={() => addLane(selectedBlock.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                    >
                      <Plus className="h-3 w-3" />
                      Add parallel activity
                    </button>
                  )}
                </div>
                {selectedBlock.lanes.map((lane) => {
                  const active = lane.id === selectedLaneId;
                  return (
                    <div
                      key={lane.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        active ? "border-primary" : "border-border"
                      }`}
                      onClick={() => setSelectedLaneId(lane.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          {selectedBlock.lanes.length > 1 && (
                            <input
                              type="text"
                              value={lane.title}
                              onChange={(e) =>
                                updateLane(selectedBlock.id, lane.id, {
                                  title: e.target.value,
                                })
                              }
                              placeholder="Lane title (e.g. Skill, Line)"
                              className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold"
                            />
                          )}
                          <textarea
                            value={lane.notes}
                            onChange={(e) =>
                              updateLane(selectedBlock.id, lane.id, {
                                notes: e.target.value,
                              })
                            }
                            rows={3}
                            placeholder="What happens in this activity? Drills, coaching points, etc."
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                          />
                        </div>
                        {selectedBlock.lanes.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLane(selectedBlock.id, lane.id);
                            }}
                            className="mt-1 rounded-md p-1 text-muted hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Diagram preview / placeholder.
                          Inline canvas authoring lands in cycle 2. */}
                      <div className="mt-3">
                        <EquipmentDiagramPreview
                          diagram={lane.diagram ?? null}
                          onClear={() =>
                            updateLane(selectedBlock.id, lane.id, { diagram: null })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
