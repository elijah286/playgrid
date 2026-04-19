"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Copy,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  archivePlaybookAction,
  createPlaybookAction,
  deletePlaybookAction,
  duplicatePlaybookAction,
  listPlaybooksAction,
  renamePlaybookAction,
  type PlaybookRow,
} from "@/app/actions/playbooks";
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
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

const TYPE_OPTIONS: { value: SportVariant; label: string }[] = [
  { value: "flag_7v7", label: "7v7" },
  { value: "flag_5v5", label: "Flag" },
  { value: "tackle_11", label: "Tackle" },
  { value: "six_man", label: "Other" },
];

export function PlaybooksClient({ initial }: { initial: PlaybookRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [sportVariant, setSportVariant] = useState<SportVariant>("flag_7v7");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [rows, setRows] = useState<PlaybookRow[]>(initial);

  function openCreate() {
    setName("");
    setSportVariant("flag_7v7");
    setCreateOpen(true);
  }

  function reload(nextView: "active" | "archived" = view) {
    startTransition(async () => {
      const res = await listPlaybooksAction({
        includeArchived: nextView === "archived",
      });
      if (res.ok) {
        setRows(
          nextView === "archived"
            ? res.playbooks.filter((b) => b.is_archived)
            : res.playbooks,
        );
      } else {
        toast(res.error, "error");
      }
    });
  }

  function setViewAndReload(v: "active" | "archived") {
    setView(v);
    reload(v);
  }

  const filtered = rows.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return p.name.toLowerCase().includes(s);
  });

  const [creating, setCreating] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Enter a playbook name.", "error");
      return;
    }
    setCreating(true);
    const res = await createPlaybookAction(trimmed, sportVariant);
    if (res.ok) {
      setCreateOpen(false);
      router.push(`/playbooks/${res.id}`);
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
      reload();
    });
  }

  function onRename(id: string, current: string) {
    const next = window.prompt("Rename playbook", current);
    if (next == null) return;
    handle(() => renamePlaybookAction(id, next));
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
            placeholder="Search playbooks..."
          />
        </div>
        <SegmentedControl
          value={view}
          onChange={(v) => setViewAndReload(v as "active" | "archived")}
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <Button variant="primary" leftIcon={Plus} onClick={openCreate}>
          Create
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          heading={
            view === "archived" ? "No archived playbooks" : "No playbooks yet"
          }
          description={
            view === "archived"
              ? "Archived playbooks show up here."
              : "Create your first playbook to group plays by game plan, opponent, or season."
          }
          action={
            view === "active" ? (
              <Button
                variant="primary"
                leftIcon={Plus}
                onClick={openCreate}
              >
                Create playbook
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const items: ActionMenuItem[] = [
              {
                label: "Rename",
                icon: Pencil,
                onSelect: () => onRename(p.id, p.name),
              },
              {
                label: "Duplicate",
                icon: Copy,
                onSelect: () =>
                  handle(
                    () => duplicatePlaybookAction(p.id),
                    (res) => {
                      if (res.ok) router.push(`/playbooks/${res.id}`);
                    },
                  ),
              },
              p.is_archived
                ? {
                    label: "Restore",
                    icon: ArchiveRestore,
                    onSelect: () =>
                      handle(() => archivePlaybookAction(p.id, false)),
                  }
                : {
                    label: "Archive",
                    icon: Archive,
                    onSelect: () =>
                      handle(() => archivePlaybookAction(p.id, true)),
                  },
              {
                label: "Delete",
                icon: Trash2,
                danger: true,
                onSelect: () =>
                  confirmAnd(
                    `Delete "${p.name}" and all its plays? This can't be undone.`,
                    () => handle(() => deletePlaybookAction(p.id)),
                  ),
              },
            ];
            return (
              <Card key={p.id} hover className="relative p-5">
                <div className="absolute right-3 top-3">
                  <ActionMenu items={items} />
                </div>
                <Link href={`/playbooks/${p.id}`}>
                  <div className="flex items-center gap-2 pr-10">
                    <h3 className="truncate font-semibold text-foreground">
                      {p.name}
                    </h3>
                    {p.is_archived && <Badge>Archived</Badge>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {SPORT_VARIANT_LABELS[p.sport_variant as SportVariant] ?? p.sport_variant}
                    </span>
                    {p.created_at && (
                      <span className="text-xs text-muted">
                        Created {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground">New playbook</h2>
            <p className="mt-1 text-sm text-muted">
              Choose a name and playbook type.
            </p>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-muted">Name</span>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring 2026"
                className="mt-1 w-full"
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
            </label>

            <div className="mt-4">
              <span className="text-xs font-medium text-muted">Type</span>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const active = sportVariant === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSportVariant(opt.value)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-foreground hover:bg-surface-inset"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={create}
                loading={creating}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
