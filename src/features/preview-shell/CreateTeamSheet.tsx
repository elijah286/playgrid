"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { createPlaybookAction } from "@/app/actions/playbooks";
import { setSelectedTeamAction } from "@/app/actions/app-shell";

const PALETTE = [
  "#F26522",
  "#EF4444",
  "#EAB308",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
  "#EC4899",
  "#1C1C1E",
];

const VARIANTS: SportVariant[] = [
  "flag_5v5",
  "flag_7v7",
  "flag_4v4",
  "flag_6v6",
  "touch_7v7",
  "tackle_11",
  "other",
];

/**
 * Create a team without leaving the shell — replaces the /home bounce on
 * "New team". Reuses createPlaybookAction (which applies the variant's default
 * rules); the coach lands scoped to the new team. Rules/logo are editable in
 * Settings afterward, so this stays a fast three-field create.
 */
export function CreateTeamSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [variant, setVariant] = useState<SportVariant>("flag_7v7");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [pending, start] = useTransition();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submit = () => {
    // Re-entry guard: the button is disabled while pending but the Enter-key
    // path isn't, so without this a double-tap / key-repeat would create
    // duplicate teams (createPlaybookAction isn't idempotent).
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Team name is required.", "error");
      return;
    }
    start(async () => {
      try {
        const res = await createPlaybookAction(trimmed, variant, { color });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        await setSelectedTeamAction(res.id);
        // Dismiss BEFORE navigating: this sheet's host (the team-switcher) lives
        // in the persistent /app layout, so router.push doesn't unmount it —
        // without onClose() the overlay + body-scroll lock would survive the
        // navigation. onClose() unmounts us and runs the scroll-restore cleanup.
        onClose();
        router.push("/app/team");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't create team.", "error");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col rounded-t-2xl bg-surface-raised shadow-2xl ring-1 ring-border sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "92dvh" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">New team</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-foreground">Team name</span>
            <input
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Eagles 12U"
              autoFocus
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-foreground">Game type</span>
            <div className="flex flex-wrap gap-1.5">
              {VARIANTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVariant(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-colors ${
                    variant === v
                      ? "bg-primary text-white ring-primary"
                      : "bg-surface text-muted ring-border hover:bg-surface-inset hover:text-foreground"
                  }`}
                >
                  {SPORT_VARIANT_LABELS[v]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-foreground">Color</span>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={`size-8 rounded-full ring-2 ring-offset-2 ring-offset-surface-raised transition-transform ${
                    color === c ? "ring-foreground" : "ring-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div
          className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Create team
          </button>
        </div>
      </div>
    </div>
  );
}
