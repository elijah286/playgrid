"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { createPlayAction } from "@/app/actions/plays";
import type { SportVariant } from "@/domain/play/types";

/**
 * Create a play, then jump straight to the full-screen editor — skipping the
 * production /playbooks grid the old "New play" link dumped coaches on just to
 * trigger the create. The editor itself stays a sanctioned handoff. Play-cap /
 * downgrade-lock errors from createPlayAction surface as a toast.
 */
export function NewPlayButton({
  playbookId,
  variant,
}: {
  playbookId: string;
  variant: SportVariant;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const res = await createPlayAction(playbookId, {
              variant,
              playType: "offense",
            });
            if (!res.ok) {
              toast(res.error, "error");
              return;
            }
            router.push(`/plays/${res.playId}/edit`);
          } catch (e) {
            toast(e instanceof Error ? e.message : "Couldn't create play.", "error");
          }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Plus className="size-4" aria-hidden />
      )}
      New play
    </button>
  );
}
