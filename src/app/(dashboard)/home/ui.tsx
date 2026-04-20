"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Archive,
  Copy,
  Inbox,
  Layers,
  Link2,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  archivePlaybookAction,
  createPlaybookAction,
  updatePlaybookSeasonAction,
  deletePlaybookAction,
  duplicatePlaybookAction,
  renamePlaybookAction,
  updatePlaybookAppearanceAction,
  uploadPlaybookLogoAction,
} from "@/app/actions/playbooks";
import type { DashboardPlaybookTile, DashboardSummary } from "@/app/actions/plays";
import type { SportVariant } from "@/domain/play/types";
import {
  defaultSettingsForVariant,
  type PlaybookSettings,
} from "@/domain/playbook/settings";
import { PlaybookRulesForm } from "@/features/playbooks/PlaybookRulesForm";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  Input,
  SegmentedControl,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";

const DEFAULT_COLORS = ["#F26522", "#3B82F6", "#22C55E", "#EF4444", "#A855F7", "#EAB308"];

function LogoPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadPlaybookLogoAction(fd);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      onChange(res.url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">
          Logo <span className="font-normal normal-case text-muted">(optional)</span>
        </label>
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "upload", label: "Upload", icon: Upload },
            { value: "url", label: "URL", icon: Link2 },
          ]}
        />
      </div>

      {mode === "upload" ? (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Upload}
            onClick={() => fileRef.current?.click()}
            loading={uploading}
            disabled={disabled || uploading}
          >
            {value ? "Replace image" : "Choose image"}
          </Button>
          {value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
              disabled={disabled || uploading}
            >
              Remove
            </Button>
          )}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/logo.png"
          disabled={disabled}
        />
      )}
      <p className="text-xs text-muted">
        PNG, JPG, WebP, SVG, or GIF — up to 2 MB.
      </p>
    </div>
  );
}

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
            {tile.season ? `${tile.season} · ` : ""}
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

function NewPlaybookTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full min-h-[212px] flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-inset/40 text-left transition-colors hover:border-primary hover:bg-primary/5"
    >
      <div className="flex h-32 items-center justify-center bg-surface-inset/60 group-hover:bg-primary/10">
        <Plus className="size-10 text-muted group-hover:text-primary" strokeWidth={1.5} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="truncate text-base font-bold text-muted group-hover:text-primary">
          New playbook
        </h3>
        <p className="text-xs text-muted">Click to create</p>
      </div>
    </button>
  );
}

export function DashboardClient({ data }: { data: DashboardSummary }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
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

  function createBook(config: {
    name: string;
    variant: SportVariant;
    color: string | null;
    logo_url: string | null;
    customOffenseCount: number | null;
    season: string | null;
    settings: PlaybookSettings;
  }) {
    startTransition(async () => {
      const res = await createPlaybookAction(
        config.name,
        config.variant,
        { color: config.color, logo_url: config.logo_url },
        config.customOffenseCount,
        config.season,
        config.settings,
      );
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setShowCreate(false);
      router.push(`/playbooks/${res.id}`);
    });
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
        label: tile.season ? "Edit season" : "Set season",
        icon: Pencil,
        onSelect: () => {
          const next = window.prompt("Season (e.g. Spring 2026)", tile.season ?? "");
          if (next == null) return;
          handle(() => updatePlaybookSeasonAction(tile.id, next));
        },
      },
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
      </div>

      {/* Owned */}
      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <NewPlaybookTile onClick={() => setShowCreate(true)} />
          {owned.map((b) => (
            <PlaybookTile key={b.id} tile={b} actions={buildOwnerActions(b)} />
          ))}
        </div>
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

      {showCreate && (
        <CreatePlaybookDialog
          pending={pending}
          onClose={() => setShowCreate(false)}
          onCreate={(config) => createBook(config)}
        />
      )}
    </div>
  );
}

const SPORT_OPTIONS: { value: SportVariant; label: string }[] = [
  { value: "flag_5v5", label: SPORT_VARIANT_LABELS.flag_5v5 },
  { value: "flag_7v7", label: SPORT_VARIANT_LABELS.flag_7v7 },
  { value: "tackle_11", label: SPORT_VARIANT_LABELS.tackle_11 },
  { value: "other", label: SPORT_VARIANT_LABELS.other },
];

function CreatePlaybookDialog({
  pending,
  onClose,
  onCreate,
}: {
  pending: boolean;
  onClose: () => void;
  onCreate: (config: {
    name: string;
    variant: SportVariant;
    color: string | null;
    logo_url: string | null;
    customOffenseCount: number | null;
    season: string | null;
    settings: PlaybookSettings;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [variant, setVariant] = useState<SportVariant>("flag_7v7");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [logoUrl, setLogoUrl] = useState("");
  const [otherCount, setOtherCount] = useState<number>(6);
  const [season, setSeason] = useState("");
  const [settings, setSettings] = useState<PlaybookSettings>(() =>
    defaultSettingsForVariant("flag_7v7"),
  );
  const touchedSettingsRef = useRef(false);

  // Sync settings to variant defaults until the user edits them directly.
  useEffect(() => {
    if (touchedSettingsRef.current) return;
    setSettings(defaultSettingsForVariant(variant, variant === "other" ? otherCount : null));
  }, [variant, otherCount]);

  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({
      name: trimmed,
      variant,
      color,
      logo_url: logoUrl.trim() || null,
      customOffenseCount: variant === "other" ? otherCount : null,
      season: season.trim() || null,
      settings,
    });
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
          <h2 className="text-base font-bold text-foreground">New playbook</h2>
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
                {initials}
              </span>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Name
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="e.g. Varsity 2026"
            />
          </div>

          {/* Season */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Season <span className="font-normal normal-case text-muted-light">(optional)</span>
            </label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="e.g. Spring 2026"
            />
          </div>

          {/* Sport variant */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Game type
            </label>
            <SegmentedControl
              options={SPORT_OPTIONS}
              value={variant}
              onChange={setVariant}
              size="sm"
            />
            {variant === "other" && (
              <div className="flex items-center gap-3 pt-1">
                <label
                  htmlFor="other-player-count"
                  className="text-xs font-medium text-muted"
                >
                  Players per side
                </label>
                <select
                  id="other-player-count"
                  value={otherCount}
                  onChange={(e) => setOtherCount(Number(e.target.value))}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {[4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Game rules */}
          <PlaybookRulesForm
            value={settings}
            onChange={(s) => {
              touchedSettingsRef.current = true;
              setSettings(s);
            }}
            disabled={pending}
          />

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

          <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={pending} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={pending}
            disabled={!name.trim()}
          >
            Create
          </Button>
        </div>
      </div>
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

          <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={saving} />
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
