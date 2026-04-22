"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  approveMemberAction,
  denyMemberAction,
  type PendingApprovalTile,
} from "@/app/actions/playbook-roster";
import { Button, useToast } from "@/components/ui";

type Props = { initialTiles: PendingApprovalTile[] };

export function PendingApprovalsCard({ initialTiles }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tiles, setTiles] = useState<PendingApprovalTile[]>(initialTiles);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (tiles.length === 0) return null;

  function removeItem(playbookId: string, userId: string) {
    setTiles((prev) =>
      prev
        .map((t) =>
          t.playbookId === playbookId
            ? { ...t, items: t.items.filter((i) => i.userId !== userId) }
            : t,
        )
        .filter((t) => t.items.length > 0),
    );
  }

  function act(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    key: string,
    playbookId: string,
    userId: string,
    okMsg: string,
  ) {
    setBusy(key);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        removeItem(playbookId, userId);
        toast(okMsg, "success");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally {
        setBusy(null);
      }
    });
  }

  const totalCount = tiles.reduce((acc, t) => acc + t.items.length, 0);

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-foreground">
            People waiting to join
          </h2>
          <p className="text-xs text-muted">
            {totalCount} pending request{totalCount === 1 ? "" : "s"} across{" "}
            {tiles.length} playbook{tiles.length === 1 ? "" : "s"}.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {tiles.map((tile) => (
          <div
            key={tile.playbookId}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              {tile.playbookLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tile.playbookLogoUrl}
                  alt=""
                  className="size-6 rounded object-cover"
                />
              ) : (
                <div
                  className="size-6 rounded"
                  style={{ backgroundColor: tile.playbookColor ?? "#64748B" }}
                />
              )}
              <Link
                href={`/playbooks/${tile.playbookId}?tab=roster`}
                className="text-sm font-semibold text-foreground hover:underline"
              >
                {tile.playbookName}
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {tile.items.map((item) => {
                const approveKey = `a:${tile.playbookId}:${item.userId}`;
                const denyKey = `d:${tile.playbookId}:${item.userId}`;
                const name = item.displayName?.trim() || "Unnamed member";
                return (
                  <li
                    key={item.userId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm text-foreground">
                        {name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          item.role === "editor"
                            ? "bg-secondary/10 text-secondary"
                            : "bg-surface-inset text-muted"
                        }`}
                      >
                        {item.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon={Check}
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            () =>
                              approveMemberAction(tile.playbookId, item.userId),
                            approveKey,
                            tile.playbookId,
                            item.userId,
                            `Approved ${name}`,
                          )
                        }
                      >
                        {busy === approveKey ? "…" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={X}
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            () =>
                              denyMemberAction(tile.playbookId, item.userId),
                            denyKey,
                            tile.playbookId,
                            item.userId,
                            `Rejected ${name}`,
                          )
                        }
                      >
                        {busy === denyKey ? "…" : "Reject"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
