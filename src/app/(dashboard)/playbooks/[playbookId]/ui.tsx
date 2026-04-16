"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import {
  archivePlayAction,
  createPlayAction,
  deletePlayAction,
  duplicatePlayAction,
  renamePlayAction,
} from "@/app/actions/plays";
import { listFormationsAction } from "@/app/actions/formations";
import type { SavedFormation } from "@/app/actions/formations";
import type { Player } from "@/domain/play/types";
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

type PlayRow = {
  id: string;
  name: string;
  wristband_code: string | null;
  shorthand: string | null;
  concept: string | null;
  updated_at: string | null;
  is_archived?: boolean;
};

export function PlaybookDetailClient({
  playbookId,
  initialPlays,
}: {
  playbookId: string;
  initialPlays: PlayRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");

  // Formation picker state
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [availableFormations, setAvailableFormations] = useState<SavedFormation[]>([]);
  const [loadingFormations, setLoadingFormations] = useState(false);

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
      (p.concept && p.concept.toLowerCase().includes(s))
    );
  });

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

  function createWithFormation(players?: Player[]) {
    setShowFormationPicker(false);
    startTransition(async () => {
      const res = await createPlayAction(playbookId, players);
      if (res.ok) {
        router.push(`/plays/${res.playId}/edit`);
        router.refresh();
      } else {
        toast(res.error, "error");
      }
    });
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
            placeholder="Search by code, name, or concept..."
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
        <Button
          variant="primary"
          leftIcon={Plus}
          loading={pending}
          onClick={openFormationPicker}
        >
          New play
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          heading="No plays yet"
          description="Create your first play to start designing routes and formations."
          action={
            <Button variant="primary" leftIcon={Plus} onClick={openFormationPicker} loading={pending}>
              New play
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const items: ActionMenuItem[] = [
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
              <Card key={p.id} hover className="flex flex-col justify-between p-5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-1">
                      {p.wristband_code && (
                        <Badge variant="primary">{p.wristband_code}</Badge>
                      )}
                      <ActionMenu items={items} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {p.concept || p.shorthand || "No concept set"}
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link href={`/plays/${p.id}/edit`} className="flex-1">
                    <Button variant="primary" size="sm" leftIcon={Pencil} className="w-full">
                      Edit
                    </Button>
                  </Link>
                  <Link href={`/m/play/${p.id}?playbookId=${playbookId}`}>
                    <Button variant="secondary" size="sm" leftIcon={Smartphone}>
                      Mobile
                    </Button>
                  </Link>
                </div>
              </Card>
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
                  {/* Default card */}
                  <button
                    type="button"
                    className="flex flex-col items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-center transition-colors hover:border-primary hover:bg-primary/10"
                    onClick={() => createWithFormation()}
                  >
                    <MiniPlayerDiagram players={null} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Default (7v7)</p>
                      <p className="text-xs text-muted">Standard formation</p>
                    </div>
                  </button>

                  {/* Saved formations */}
                  {availableFormations.map((f) => (
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

/** Small SVG diagram showing player dots at their normalized positions */
function MiniPlayerDiagram({ players }: { players: Player[] | null }) {
  const SIZE = 80;
  const DOT_R = 4;

  // Default placeholder dots if no players
  if (!players) {
    // Show a simple 7v7 icon grid
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
        // Normalized position: x in 0–1 (left→right), y in 0–1 (bottom→top)
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
