"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { updateDisplayNameAction } from "@/app/actions/account";

const DISMISS_KEY = "name-capture-prompt-dismissed-v1";

/** Soft, dismissible modal that asks an existing user for their name
 *  when their profile has none on file (or the only "name" we have is
 *  their email — the legacy backfill default). Mounted in the
 *  dashboard layout; only renders when the server-side `needed` flag
 *  is true. Skip persists in localStorage so it doesn't reappear on
 *  every navigation, but clears on a fresh sign-in (no cookies). */
export function NameCapturePrompt({ needed }: { needed: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!needed) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;
    setOpen(true);
  }, [needed]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setOpen(false);
  }

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast("Enter your name.", "error");
      return;
    }
    setSaving(true);
    const res = await updateDisplayNameAction({ displayName: trimmed });
    setSaving(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    toast("Saved.", "success");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-start justify-between gap-2 px-5 pt-5">
          <div>
            <h2 className="text-base font-bold text-foreground">
              What should we call you?
            </h2>
            <p className="mt-1 text-xs text-muted">
              Your name shows up next to plays you add, on rosters, and when
              you share a playbook. We never had it on file.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="-mt-1 -mr-1 rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Coach Smith"
            maxLength={80}
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={dismiss}
              disabled={saving}
              className="text-xs font-medium text-muted hover:text-foreground"
            >
              Later
            </button>
            <Button onClick={save} loading={saving} disabled={name.trim().length < 2}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
