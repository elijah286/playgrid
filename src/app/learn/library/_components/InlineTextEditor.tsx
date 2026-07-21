"use client";

// Admin-only, on-page inline editor for a single library prose field.
// Non-admins see the plain text (or nothing when empty). Admins see the
// text with a hover "edit" affordance → an in-place textarea → Save, which
// calls saveLibraryTextAction (metadata-only; never touches the play
// diagram) and refreshes the server component so the override renders.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import {
  saveLibraryTextAction,
  type LibraryTextField,
} from "@/app/actions/library-admin";
import type { LibraryVariant } from "@/lib/learn/variant";

export function InlineTextEditor({
  slug,
  variant,
  field,
  value,
  isAdmin,
  placeholder = "Add coaching guidance…",
  className = "",
}: {
  slug: string;
  variant: LibraryVariant;
  field: LibraryTextField;
  value: string;
  isAdmin: boolean;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveLibraryTextAction({
        slug,
        variant,
        field,
        value: draft.trim(),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  // Public / non-admin: plain text, nothing when empty.
  if (!isAdmin) {
    return value ? <p className={className}>{value}</p> : null;
  }

  if (editing) {
    return (
      <div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          autoFocus
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-surface-inset p-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1 text-xs font-semibold text-surface-raised disabled:opacity-60"
          >
            <Check className="size-3.5" />
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setError(null);
              setEditing(false);
            }}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <X className="size-3.5" />
            Cancel
          </button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="group/inline relative">
      <div className={value ? className : `${className} italic text-muted`}>
        {value || placeholder}
      </div>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        aria-label={`Edit ${field}`}
        className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-muted opacity-0 transition-opacity hover:text-primary focus:opacity-100 group-hover/inline:opacity-100"
      >
        <Pencil className="size-3" />
        edit
      </button>
    </div>
  );
}
