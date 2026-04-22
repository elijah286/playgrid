"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setExampleMakerModeAction } from "@/app/actions/admin-examples";
import { useToast } from "@/components/ui";

export function ExampleMakerExitButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function exit() {
    startTransition(async () => {
      const res = await setExampleMakerModeAction(false);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={exit}
      disabled={pending}
      className="inline-flex items-center rounded-md border border-amber-600/30 bg-white/60 px-2 py-0.5 font-semibold text-amber-950 shadow-sm transition-colors hover:bg-white disabled:opacity-50 dark:border-amber-300/30 dark:bg-amber-900/40 dark:text-amber-50 dark:hover:bg-amber-900/60"
    >
      {pending ? "Exiting…" : "Exit"}
    </button>
  );
}
