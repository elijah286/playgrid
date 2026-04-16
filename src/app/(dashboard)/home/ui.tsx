"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Archive,
  BookOpen,
  Copy,
  FileText,
  Library,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  archivePlaybookAction,
  createPlaybookAction,
  deletePlaybookAction,
  duplicatePlaybookAction,
  renamePlaybookAction,
} from "@/app/actions/playbooks";
import {
  archivePlayAction,
  deletePlayAction,
  duplicatePlayAction,
  renamePlayAction,
  type DashboardSummary,
} from "@/app/actions/plays";
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

export function DashboardClient({ data }: { data: DashboardSummary }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [newBookName, setNewBookName] = useState("");

  const mostRecent = data.recentPlays[0];
  const recentTail = data.recentPlays.slice(1);

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
          router.push(`/playbooks/${res.id}`);
        }
      },
    );
  }

  function onRenamePlay(playId: string, current: string) {
    const next = window.prompt("Rename play", current);
    if (next == null) return;
    handle(() => renamePlayAction(playId, next));
  }

  function onRenameBook(bookId: string, current: string) {
    const next = window.prompt("Rename playbook", current);
    if (next == null) return;
    handle(() => renamePlaybookAction(bookId, next));
  }

  function confirmAnd(msg: string, fn: () => void) {
    if (window.confirm(msg)) fn();
  }

  return (
    <div className="space-y-10">
      {/* Header + primary CTA */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted">
            Pick up where you left off or start something new.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/plays/new">
            <Button variant="primary" leftIcon={Plus} loading={pending}>
              New play
            </Button>
          </Link>
          <Link href="/playbooks">
            <Button variant="secondary" leftIcon={Library}>
              All playbooks
            </Button>
          </Link>
        </div>
      </div>

      {/* Continue where you left off */}
      {mostRecent && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
            Continue editing
          </h2>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-lg font-bold text-foreground">
                  {mostRecent.name}
                </h3>
                {mostRecent.wristband_code && (
                  <Badge variant="primary">{mostRecent.wristband_code}</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                {mostRecent.playbook_name}
                {mostRecent.concept ? ` · ${mostRecent.concept}` : ""}
              </p>
            </div>
            <Link href={`/plays/${mostRecent.id}/edit`}>
              <Button variant="primary" leftIcon={Pencil}>
                Resume
              </Button>
            </Link>
          </Card>
        </section>
      )}

      {/* Recent plays */}
      {recentTail.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
            Recent plays
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentTail.map((p) => {
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
                {
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
                <Card
                  key={p.id}
                  hover
                  className="flex flex-col justify-between p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-foreground">
                        {p.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {p.playbook_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {p.wristband_code && (
                        <Badge variant="primary">{p.wristband_code}</Badge>
                      )}
                      <ActionMenu items={items} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Link href={`/plays/${p.id}/edit`}>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={Pencil}
                        className="w-full"
                      >
                        Edit
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Playbooks */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Your playbooks
          </h2>
          <div className="flex gap-2">
            <Input
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              placeholder="New playbook name"
              className="h-8 w-48 text-sm"
            />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Plus}
              onClick={createBook}
              loading={pending}
            >
              Create
            </Button>
          </div>
        </div>

        {data.playbooks.filter((b) => !b.is_default).length === 0 ? (
          <EmptyState
            icon={BookOpen}
            heading="No playbooks yet"
            description="Plays you create live in your Inbox by default. Group them into a playbook when you're ready."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.playbooks
              .filter((b) => !b.is_default)
              .map((b) => {
                const items: ActionMenuItem[] = [
                  {
                    label: "Rename",
                    icon: Pencil,
                    onSelect: () => onRenameBook(b.id, b.name),
                  },
                  {
                    label: "Duplicate",
                    icon: Copy,
                    onSelect: () =>
                      handle(
                        () => duplicatePlaybookAction(b.id),
                        (res) => {
                          if (res.ok) router.push(`/playbooks/${res.id}`);
                        },
                      ),
                  },
                  {
                    label: "Archive",
                    icon: Archive,
                    onSelect: () => handle(() => archivePlaybookAction(b.id, true)),
                  },
                  {
                    label: "Delete",
                    icon: Trash2,
                    danger: true,
                    onSelect: () =>
                      confirmAnd(
                        `Delete "${b.name}" and all its plays? This can't be undone.`,
                        () => handle(() => deletePlaybookAction(b.id)),
                      ),
                  },
                ];
                return (
                  <Card
                    key={b.id}
                    hover
                    className="flex items-center justify-between gap-2 p-4"
                  >
                    <Link
                      href={`/playbooks/${b.id}`}
                      className="min-w-0 flex-1"
                    >
                      <h3 className="truncate font-semibold text-foreground">
                        {b.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {b.play_count} play{b.play_count === 1 ? "" : "s"}
                      </p>
                    </Link>
                    <ActionMenu items={items} />
                  </Card>
                );
              })}
          </div>
        )}

        {/* Inbox surfaces as a quiet chip, not a card */}
        {data.playbooks.some((b) => b.is_default) && (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <FileText className="size-3.5" />
            <span>
              Unfiled plays live in your{" "}
              {(() => {
                const inbox = data.playbooks.find((b) => b.is_default);
                return inbox ? (
                  <Link
                    href={`/playbooks/${inbox.id}`}
                    className="underline hover:text-foreground"
                  >
                    Inbox ({inbox.play_count})
                  </Link>
                ) : (
                  <span>Inbox</span>
                );
              })()}
              .
            </span>
          </p>
        )}
      </section>
    </div>
  );
}
