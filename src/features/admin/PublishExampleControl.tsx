"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { setPlaybookPublicExampleAction } from "@/app/actions/admin-examples";
import { useToast } from "@/components/ui";

export function PublishExampleControl({
  playbookId,
  initialPublished,
}: {
  playbookId: string;
  initialPublished: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [published, setPublished] = useState(initialPublished);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    const prev = published;
    setPublished(next);
    startTransition(async () => {
      const res = await setPlaybookPublicExampleAction(playbookId, next);
      if (!res.ok) {
        setPublished(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Published to /examples." : "Removed from /examples.",
        "success",
      );
      router.refresh();
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-50/80 px-4 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="inline-flex items-center gap-2">
        <FlaskConical className="size-4" />
        <span className="font-semibold">Examples author playbook</span>
        <span className="text-amber-900/70 dark:text-amber-100/70">
          — toggle to show on the public /examples page.
        </span>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={published}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>{published ? "Published" : "Draft"}</span>
      </label>
    </div>
  );
}
