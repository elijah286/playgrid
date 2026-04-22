"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";

import { duplicatePlaybookToExamplesAction } from "@/app/actions/admin-examples";
import { useToast } from "@/components/ui";

export function DuplicateToExamplesControl({
  playbookId,
  playbookName,
}: {
  playbookId: string;
  playbookName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(`${playbookName} (example)`);

  function go(name?: string) {
    startTransition(async () => {
      const res = await duplicatePlaybookToExamplesAction(playbookId, name);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Copied into the examples author.", "success");
      router.push(`/playbooks/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-2 text-sm text-foreground">
      <div className="inline-flex items-center gap-2">
        <Copy className="size-4 text-muted" />
        <span className="font-semibold">Use this as an example</span>
        <span className="text-muted">
          — copy into the examples author so you can tweak it before
          publishing.
        </span>
      </div>
      {renaming ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={draftName}
            disabled={pending}
            onChange={(e) => setDraftName(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={() => go(draftName)}
            disabled={pending || !draftName.trim()}
            className="inline-flex items-center rounded-md bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Copying…" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            disabled={pending}
            className="text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRenaming(true)}
            disabled={pending}
            className="text-sm text-muted hover:text-foreground"
          >
            Rename first
          </button>
          <button
            type="button"
            onClick={() => go()}
            disabled={pending}
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Copying…" : "Duplicate into examples"}
          </button>
        </div>
      )}
    </div>
  );
}
