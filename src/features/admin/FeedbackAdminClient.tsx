"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton, useToast } from "@/components/ui";
import type { FeedbackRow } from "@/app/actions/feedback";
import {
  deleteFeedbackAction,
  listFeedbackForAdminAction,
  setFeedbackWidgetEnabledAction,
} from "@/app/actions/feedback";

export function FeedbackAdminClient({
  initialItems,
  initialError,
  initialWidgetEnabled,
}: {
  initialItems: FeedbackRow[];
  initialError: string | null;
  initialWidgetEnabled: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [err, setErr] = useState<string | null>(initialError);
  const [widgetEnabled, setWidgetEnabled] = useState(initialWidgetEnabled);
  const [widgetPending, startWidgetTransition] = useTransition();
  const [pending, startTransition] = useTransition();

  function toggleWidget(next: boolean) {
    const prev = widgetEnabled;
    setWidgetEnabled(next);
    startWidgetTransition(async () => {
      const res = await setFeedbackWidgetEnabledAction(next);
      if (!res.ok) {
        setWidgetEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Feedback pill is visible to users." : "Feedback pill hidden.",
        "success",
      );
    });
  }

  function refresh() {
    startTransition(async () => {
      const res = await listFeedbackForAdminAction();
      if (res.ok) {
        setItems(res.items);
        setErr(null);
      } else {
        setErr(res.error);
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this feedback? This cannot be undone.")) return;
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await deleteFeedbackAction(id);
      if (!res.ok) {
        setErr(res.error);
        setItems(prev);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Floating “Send feedback” pill
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When off, the draggable feedback button is hidden for everyone.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={widgetEnabled}
            disabled={widgetPending}
            onChange={(e) => toggleWidget(e.target.checked)}
          />
          <span>{widgetEnabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            User feedback
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {items.length} submission{items.length === 1 ? "" : "s"}, most recent first.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={RefreshCw}
          loading={pending}
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>

      {err && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
          {err}
        </p>
      )}

      {items.length === 0 && !err ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted">No feedback submitted yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-border bg-surface-raised p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">
                      {item.displayName || item.email || item.userId || "Anonymous"}
                    </span>
                    {item.source === "contact" && (
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Contact form
                      </span>
                    )}
                  </p>
                  {item.email && item.displayName && (
                    <p className="truncate text-xs text-muted">{item.email}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <time
                    dateTime={item.createdAt}
                    className="text-xs text-muted"
                  >
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                  <IconButton
                    icon={Trash2}
                    variant="ghost"
                    size="sm"
                    tooltip="Delete feedback"
                    aria-label="Delete feedback"
                    onClick={() => remove(item.id)}
                  />
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                {item.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
