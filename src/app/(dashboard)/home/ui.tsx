"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Archive,
  BookOpen,
  Copy,
  Inbox,
  Layers,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  archivePlaybookAction,
  createPlaybookAction,
  deletePlaybookAction,
  duplicatePlaybookAction,
  renamePlaybookAction,
  updatePlaybookAppearanceAction,
} from "@/app/actions/playbooks";
import type { DashboardPlaybookTile, DashboardSummary } from "@/app/actions/plays";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";

const DEFAULT_COLORS = ["#F26522", "#3B82F6", "#22C55E", "#EF4444", "#A855F7", "#EAB308"];

function colorFor(tile: DashboardPlaybookTile): string {
  if (tile.color) return tile.color;
  // Stable hash → palette index so unclaimed tiles still feel distinct.
  let h = 0;
  for (let i = 0; i < tile.id.length; i++) h = (h * 31 + tile.id.charCodeAt(i)) >>> 0;
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length];
}

function PlaybookTile({
  tile,
  actions,
}: {
  tile: DashboardPlaybookTile;
  actions: ActionMenuItem[];
}) {
  const color = colorFor(tile);
  const initials = tile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "PB";

  return (
    <Card hover className="group relative overflow-hidden p-0">
      <Link href={`/playbooks/${tile.id}`} className="flex h-full flex-col">
        <div
          className="flex h-32 items-center justify-center"
          style={{ backgroundColor: color }}
        >
          {tile.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tile.logo_url}
              alt=""
              className="h-20 w-20 object-contain"
            />
          ) : (
            <span className="text-4xl font-black tracking-tight text-white drop-shadow">
              {initials}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">
              {tile.name}
            </h3>
            {tile.role !== "owner" && (
              <Badge variant={tile.role === "editor" ? "primary" : "default"}>
                {tile.role === "editor" ? "Editor" : "Viewer"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted">
            {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
          </p>
        </div>
      </Link>
      {actions.length > 0 && (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionMenu items={actions} />
        </div>
      )}
    </Card>
  );
}

export function DashboardClient({ data }: { data: DashboardSummary }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [newBookName, setNewBookName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingAppearance, setEditingAppearance] = useState<DashboardPlaybookTile | null>(null);

  const owned = data.playbooks.filter((b) => b.role === "owner" && !b.is_default);
  const shared = data.playbooks.filter((b) => b.role !== "owner");
  const inbox = data.playbooks.find((b) => b.is_default && b.role === "owner");

  function refresh() {
    router.refresh();
  }

  function handle<T>(
    fn: () => Promise<T>,
    onOk?: (result: T) => void,
    errLabel = "Something went wrong.",
  ) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && typeof res === "object" && "ok" in res) {
          const r = res as { ok: boolean; error?: string };
          if (!r.ok) {
            toast(r.error ?? errLabel, "error");
            return;
          }
        }
        onOk?.(res);
        refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : errLabel, "error");
      }
    });
  }

  function createBook() {
    handle(
      () => createPlaybookAction(newBookName || "New playbook"),
      (res) => {
        if (res.ok) {
          setNewBookName("");
          setShowCreate(false);
          router.push(`/playbooks/${res.id}`);
        }
      },
    );
  }

  function onRenameBook(bookId: string, current: string) {
    const next = window.prompt("Rename playbook", current);
    if (next == null) return;
    handle(() => renamePlaybookAction(bookId, next));
  }

  function confirmAnd(msg: string, fn: () => void) {
    if (window.confirm(msg)) fn();
  }

  function buildOwnerActions(tile: DashboardPlaybookTile): ActionMenuItem[] {
    return [
      { label: "Rename", icon: Pencil, onSelect: () => onRenameBook(tile.id, tile.name) },
      {
        label: "Edit appearance",
        icon: Palette,
        onSelect: () => setEditingAppearance(tile),
      },
      {
        label: "Duplicate",
        icon: Copy,
        onSelect: () =>
          handle(
            () => duplicatePlaybookAction(tile.id),
            (res) => {
              if (res.ok) router.push(`/playbooks/${res.id}`);
            },
          ),
      },
      {
        label: "Archive",
        icon: Archive,
        onSelect: () => handle(() => archivePlaybookAction(tile.id, true)),
      },
      {
        label: "Delete",
        icon: Trash2,
        danger: true,
        onSelect: () =>
          confirmAnd(
            `Delete "${tile.name}" and all its plays? This can't be undone.`,
            () => handle(() => deletePlaybookAction(tile.id)),
          ),
      },
    ];
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Your playbooks
          </h1>
          <p className="mt-1 text-sm text-muted">
            Pick a playbook to edit plays, add notes, or share with your team.
          </p>
        </div>
        <div className="flex gap-2">
          {showCreate ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createBook();
                  if (e.key === "Escape") {
                    setShowCreate(false);
                    setNewBookName("");
                  }
                }}
                placeholder="Playbook name"
                className="h-9 w-56"
              />
              <Button variant="primary" onClick={createBook} loading={pending}>
                Create
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreate(false);
                  setNewBookName("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              leftIcon={Plus}
              onClick={() => setShowCreate(true)}
            >
              New playbook
            </Button>
          )}
        </div>
      </div>

      {/* Owned */}
      <section>
        {owned.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            heading="No playbooks yet"
            description="Create your first playbook to start designing plays."
            action={
              <Button
                variant="primary"
                leftIcon={Plus}
                onClick={() => setShowCreate(true)}
              >
                New playbook
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {owned.map((b) => (
              <PlaybookTile key={b.id} tile={b} actions={buildOwnerActions(b)} />
            ))}
          </div>
        )}
      </section>

      {/* Shared with you */}
      {shared.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Users className="size-3.5" /> Shared with you
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shared.map((b) => (
              <PlaybookTile key={b.id} tile={b} actions={[]} />
            ))}
          </div>
        </section>
      )}

      {/* Footer links: Formations + Inbox */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/formations">
          <Card hover className="flex items-center gap-3 p-4">
            <Layers className="size-5 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Formations</p>
              <p className="text-xs text-muted">Reusable starting alignments</p>
            </div>
          </Card>
        </Link>
        {inbox && (
          <Link href={`/playbooks/${inbox.id}`}>
            <Card hover className="flex items-center gap-3 p-4">
              <Inbox className="size-5 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Inbox</p>
                <p className="text-xs text-muted">
                  {inbox.play_count} unfiled play{inbox.play_count === 1 ? "" : "s"}
                </p>
              </div>
            </Card>
          </Link>
        )}
      </section>

      {editingAppearance && (
        <AppearanceDialog
          tile={editingAppearance}
          onClose={() => setEditingAppearance(null)}
          onSaved={() => {
            setEditingAppearance(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const PALETTE = [
  "#F26522", "#EF4444", "#EAB308", "#22C55E",
  "#3B82F6", "#A855F7", "#EC4899", "#1C1C1E",
];

function AppearanceDialog({
  tile,
  onClose,
  onSaved,
}: {
  tile: DashboardPlaybookTile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState(tile.logo_url ?? "");
  const [color, setColor] = useState<string>(tile.color ?? colorFor(tile));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await updatePlaybookAppearanceAction(tile.id, {
      logo_url: logoUrl || null,
      color: color || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    onSaved();
  }

  async function clear() {
    setSaving(true);
    const res = await updatePlaybookAppearanceAction(tile.id, {
      logo_url: null,
      color: null,
    });
    setSaving(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">Edit appearance</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Preview */}
          <div
            className="flex h-28 items-center justify-center rounded-lg"
            style={{ backgroundColor: color }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-20 w-20 object-contain" />
            ) : (
              <span className="text-3xl font-black tracking-tight text-white drop-shadow">
                {tile.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0])
                  .filter(Boolean)
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "PB"}
              </span>
            )}
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Team color
            </label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => {
                const active = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      active ? "border-foreground scale-110" : "border-border"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                );
              })}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border-2 border-border"
                aria-label="Custom color"
              />
            </div>
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Logo URL
            </label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-muted">
              Paste an image URL. Leave blank to show the playbook initials.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={clear} disabled={saving}>
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
