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
  Select,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

const SPORT_OPTIONS = (Object.entries(SPORT_VARIANT_LABELS) as [SportVariant, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function PlaybooksClient({ initial }: { initial: PlaybookRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [sportVariant, setSportVariant] = useState<SportVariant>("flag_7v7");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [rows, setRows] = useState<PlaybookRow[]>(initial);

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

  function create() {
    startTransition(async () => {
      const res = await createPlaybookAction(name || "New playbook", sportVariant);
      if (res.ok) {
        router.push(`/playbooks/${res.id}`);
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
        <div className="flex flex-wrap gap-2">
          <Select
            value={sportVariant}
            onChange={(v) => setSportVariant(v as SportVariant)}
            options={SPORT_OPTIONS}
            className="w-44"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playbook name"
            className="w-44"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button
            variant="primary"
            leftIcon={Plus}
            loading={pending}
            onClick={create}
          >
            Create
          </Button>
        </div>
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
                onClick={create}
                loading={pending}
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
    </div>
  );
}
