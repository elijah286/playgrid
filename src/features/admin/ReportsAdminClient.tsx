"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import {
  deleteContentReportAction,
  listContentReportsAction,
  setContentReportStatusAction,
  type ContentReportRow,
} from "@/app/actions/admin-reports";
import { REPORT_REASONS, type ReportStatus } from "@/lib/moderation/report-types";

const REASON_LABEL = new Map<string, string>(
  REPORT_REASONS.map((r) => [r.value, r.label]),
);
const CONTENT_LABEL: Record<string, string> = {
  playbook_message: "Team message",
  shared_play: "Shared play",
  profile: "Profile",
  cal_response: "Coach Cal response",
  other: "Other",
};

export function ReportsAdminClient({
  initialItems = [],
  initialError = null,
}: {
  initialItems?: ContentReportRow[];
  initialError?: string | null;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [err, setErr] = useState<string | null>(initialError);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  // The settings shell mounts this only when the Reports tab is opened, and
  // doesn't thread server data through its (large) props chain — so load on
  // mount. Reports are admin-only and low-volume; one fetch on open is fine.
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    refresh("open");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function refresh(next: "open" | "all" = filter) {
    setFilter(next);
    startTransition(async () => {
      const res = await listContentReportsAction(next);
      if (res.ok) {
        setItems(res.items);
        setErr(null);
      } else {
        setErr(res.error);
      }
    });
  }

  function setStatus(id: string, status: ReportStatus) {
    const prev = items;
    // In the Open view, anything moved off "open" drops out of the list.
    setItems((xs) =>
      filter === "open" && status !== "open"
        ? xs.filter((x) => x.id !== id)
        : xs.map((x) => (x.id === id ? { ...x, status } : x)),
    );
    startTransition(async () => {
      const res = await setContentReportStatusAction(id, status);
      if (!res.ok) {
        setItems(prev);
        toast(res.error, "error");
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await deleteContentReportAction(id);
      if (!res.ok) {
        setItems(prev);
        toast(res.error, "error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => refresh(f)}
              className={`rounded-md px-3 py-1 font-medium capitalize ${
                filter === f ? "bg-primary text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => refresh()} loading={pending}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No {filter === "open" ? "open " : ""}reports. 🎉
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface-raised p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-surface-inset px-2 py-0.5 font-semibold text-foreground">
                  {CONTENT_LABEL[r.content_type] ?? r.content_type}
                </span>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                  {REASON_LABEL.get(r.reason) ?? r.reason}
                </span>
                {r.status !== "open" && (
                  <span className="rounded-full bg-surface-inset px-2 py-0.5 capitalize text-muted">
                    {r.status}
                  </span>
                )}
                <span className="ml-auto text-muted">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>

              {r.reported_text && (
                <blockquote className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-2 text-xs text-foreground">
                  {r.reported_text}
                </blockquote>
              )}
              {r.details && (
                <p className="mt-2 text-xs text-muted">
                  <span className="font-medium text-foreground">Reporter note:</span> {r.details}
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Reported by{" "}
                {r.reporter_display_name || r.reporter_email || (r.reporter_id ? "a user" : "an anonymous viewer")}
                {r.playbook_id ? ` · playbook ${r.playbook_id.slice(0, 8)}…` : ""}
                {r.content_ref ? ` · ref ${r.content_ref.slice(0, 24)}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.status !== "actioned" && (
                  <Button variant="secondary" onClick={() => setStatus(r.id, "actioned")}>
                    Mark actioned
                  </Button>
                )}
                {r.status !== "dismissed" && (
                  <Button variant="secondary" onClick={() => setStatus(r.id, "dismissed")}>
                    Dismiss
                  </Button>
                )}
                {r.status !== "open" && (
                  <Button variant="ghost" onClick={() => setStatus(r.id, "open")}>
                    Reopen
                  </Button>
                )}
                <button
                  type="button"
                  aria-label="Delete report"
                  onClick={() => remove(r.id)}
                  className="ml-auto inline-flex items-center rounded p-1.5 text-muted hover:bg-surface-inset hover:text-rose-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
