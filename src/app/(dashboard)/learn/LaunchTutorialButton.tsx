"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { launchEditorTutorial } from "@/features/tutorials/launch";
import type { TutorialId } from "@/features/tutorials/engine/types";

/** Per-playbook button on the Learning Center that kicks off a tutorial
 *  in the play editor. Always creates a brand-new tutorial play under
 *  the given playbook so the coach starts on a clean slate. */
export function LaunchTutorialButton({
  tutorialId,
  playbookId,
  playbookName,
  variantLabel,
}: {
  tutorialId: TutorialId;
  playbookId: string;
  playbookName: string;
  variantLabel: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await launchEditorTutorial(tutorialId, playbookId, router);
          if (!res.ok) {
            toast(res.error ?? "Could not start the tutorial.", "error");
          }
        })
      }
      className="group flex w-full items-center justify-between rounded-md border border-border bg-surface-raised px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-surface-inset disabled:cursor-progress disabled:opacity-70"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{playbookName}</span>
        {variantLabel && (
          <span className="shrink-0 rounded-full bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {variantLabel}
          </span>
        )}
      </span>
      {pending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />
      ) : (
        <ArrowRight className="size-3.5 shrink-0 text-muted transition-colors group-hover:text-primary" />
      )}
    </button>
  );
}
